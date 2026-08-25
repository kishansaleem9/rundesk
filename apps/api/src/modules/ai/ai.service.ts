import {
  Injectable,
  Inject,
  Optional,
  HttpException,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import type { Response } from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { aiUsage, workspaces, workspaceMembers, spaces, spaceMembers, projects, projectMembers, lists, tasks, taskComments, taskAttachments, taskAssignees, taskActivity, docs, users, notifications, knowledgeEmbeddings, personalTasks, skills } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import {
  fallbackProposal,
  parseSkillProposal,
  renderProposal,
  type ProposalStep,
  type SkillProposal,
} from '../skills/skill-proposal'
import { R2Service } from '../../common/storage/r2.service'
import { estimateAiCostUsd } from './ai-cost'
import { TasksService } from '../tasks/tasks.service'
import { SearchService } from '../search/search.service'
import { EmbeddingService } from './embedding.service'
import { embedText, cosineSimilarity } from './embedding'
import { ATTACHMENT_TEXT_CAP, extractAttachmentText, isExtractableAttachment } from './attachment-text'
import { isWorkspaceManager } from '../../common/permissions/container-access.guard-helper'
import { resolveIsManager, taskVisibilityFilter, listVisibilityFilter } from '../../common/permissions/item-visibility'
import {
  assembleKnowledgeContext,
  deterministicKnowledgeAnswer,
  formatHelpKnowledgeBase,
  hitToSource,
  matchHelpTopics,
  helpTopicToSource,
  splitSearchId,
  HELP_TOPICS,
  HELP_NO_MATCH,
  type KnowledgeSource,
  type RawSearchHit,
} from './knowledge'
import {
  COMMAND_TOOLS,
  planFromToolCalls,
  searchTasksInContext,
  type CommandContext,
  type CommandExecuteResult,
  type CommandActionResult,
  type CommandPlan,
  type PlanAction,
  type StatusCategory,
  type ToolCall,
} from './ai-command'

export type AiCtx = { userId?: string; workspaceId?: string }

/** Format a Date | string | null to YYYY-MM-DD, or '' when absent/invalid. */
function toDayString(value: Date | string | null | undefined): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function truncate(input: string, max: number): string {
  const t = (input ?? '').trim().replace(/\s+/g, ' ')
  return t.length > max ? `${t.slice(0, max)}…` : t
}

export type WorkspaceContextData = {
  workspaceName: string
  role: string
  counts: { spaces: number; projects: number; lists: number; openTasks: number }
  spaces: Array<{ name: string; projects: string[] }>
  openTasks: Array<{ title: string; dueDate: Date | string | null; priority: string }>
  history: Array<{ title: string; status: string; updatedAt: Date | string | null }>
  currentView?: string
}

/**
 * Assemble the grounded workspace context string (Plan §7.6/§7.15). Pure and
 * token-bounded: caps structure to 15 spaces × 8 projects, 15 open tasks, and
 * 40 history rows. Extracted from the DB read so it can be unit-tested directly.
 */
export function formatWorkspaceContext(data: WorkspaceContextData): string {
  const c = data.counts
  const lines: string[] = [`Workspace: ${data.workspaceName}`, `Your role: ${data.role}`]
  if (data.currentView) lines.push(`Current view: ${data.currentView}`)
  lines.push(
    `Workspace totals: ${c.spaces} spaces, ${c.projects} projects, ${c.lists} lists, ${c.openTasks} open tasks`,
  )

  if (data.spaces.length) {
    const structure = data.spaces
      .slice(0, 15)
      .map((s) => {
        const shown = s.projects.slice(0, 8)
        const extra = s.projects.length > shown.length ? `, +${s.projects.length - shown.length} more` : ''
        return `- ${s.name}${shown.length ? ` — projects: ${shown.join(', ')}${extra}` : ''}`
      })
      .join('\n')
    lines.push(`Workspace structure:\n${structure}`)
  }

  if (data.openTasks.length) {
    const mine = data.openTasks
      .slice(0, 15)
      .map((t) => {
        const due = toDayString(t.dueDate)
        return `- ${t.title}${due ? ` (due ${due})` : ''} [${t.priority}]`
      })
      .join('\n')
    lines.push(`Your open assigned tasks:\n${mine}`)
  } else {
    lines.push('You have no open assigned tasks.')
  }

  if (data.history.length) {
    const hist = data.history
      .slice(0, 40)
      .map((t) => {
        const when = toDayString(t.updatedAt)
        return `- ${t.title} [${t.status}]${when ? ` (updated ${when})` : ''}`
      })
      .join('\n')
    lines.push(`Recent task history (last 90 days, tasks you're involved in):\n${hist}`)
  }

  return lines.join('\n')
}

export type TaskSummaryInput = {
  title: string
  description: string | null
  status?: string | null
  priority?: string | null
  activity: Array<{ action: string; actor: string | null }>
  subtasks: Array<{ title: string; status: string }>
  blockers: Array<{ title: string; status: string }>
  comments: Array<{ author: string | null; body: string }>
}

/**
 * Assemble the enriched task-summary prompt input (Plan §7.5). Pure and bounded:
 * caps subtasks (12), blockers (10), comments (last 6, trimmed), activity (8).
 * Extracted from the DB reads so it can be unit-tested directly.
 */
export function formatTaskSummaryInput(input: TaskSummaryInput): string {
  const sections: string[] = [`Task: ${input.title || '(untitled)'}`]
  if (input.status) sections.push(`Status: ${input.status}`)
  if (input.priority) sections.push(`Priority: ${input.priority}`)
  sections.push(`Description:\n${input.description?.trim() ? input.description.trim() : '(no description)'}`)

  if (input.subtasks.length) {
    const shown = input.subtasks.slice(0, 12)
    sections.push(
      `Open subtasks (${input.subtasks.length}):\n${shown.map((s) => `- ${s.title} [${s.status}]`).join('\n')}`,
    )
  }
  if (input.blockers.length) {
    const shown = input.blockers.slice(0, 10)
    sections.push(
      `Open blockers (${input.blockers.length}):\n${shown.map((b) => `- ${b.title} [${b.status}]`).join('\n')}`,
    )
  }
  if (input.comments.length) {
    const recent = input.comments.slice(-6)
    sections.push(
      `Recent comments:\n${recent.map((cm) => `- ${cm.author ?? 'Someone'}: ${truncate(cm.body, 240)}`).join('\n')}`,
    )
  }
  if (input.activity.length) {
    const recent = input.activity.slice(0, 8)
    sections.push(
      `Recent activity:\n${recent.map((a) => `- ${a.actor ?? 'Someone'} ${a.action.replace(/_/g, ' ')}`).join('\n')}`,
    )
  }

  return sections.join('\n\n')
}

// ─── Automation suggestions (Plan §7.7) ──────────────────────────────────────

/** Trigger / action types an AI-suggested rule may use — mirrors the builder UI. */
const SUGGESTION_TRIGGERS = new Set([
  'task.created',
  'task.status_changed',
  'task.due_passed',
  'task.comment_added',
  'task.assignee_changed',
  'task.overdue',
])
const SUGGESTION_ACTIONS = new Set([
  'change_status',
  'set_priority',
  'send_notification',
  'create_subtask',
  'assign_member',
  'post_to_channel',
])

export type AutomationBehavior = {
  totalOpenTasks: number
  overdueCount: number
  statusTransitions: Array<{ from: string; to: string; count: number }>
  topAssignees: Array<{ name: string; count: number }>
  commentActivityCount: number
}

export type AutomationSuggestion = {
  name: string
  trigger: { type: string; filters?: Record<string, string> }
  actions: Array<{ type: string; params: Record<string, string> }>
  rationale: string
}

/** Compact, human-readable behavior summary fed to the model. Pure + testable. */
export function formatAutomationBehavior(b: AutomationBehavior): string {
  const lines: string[] = [
    `Open tasks: ${b.totalOpenTasks}`,
    `Currently overdue tasks: ${b.overdueCount}`,
    `Comment activity (last 30 days): ${b.commentActivityCount}`,
  ]
  if (b.statusTransitions.length) {
    lines.push('Most common status transitions (last 30 days):')
    for (const t of b.statusTransitions.slice(0, 6)) lines.push(`- ${t.from} -> ${t.to} (${t.count}x)`)
  } else {
    lines.push('No recorded status transitions in the last 30 days.')
  }
  if (b.topAssignees.length) {
    lines.push('Most active assignees:')
    for (const a of b.topAssignees.slice(0, 5)) lines.push(`- ${a.name} (${a.count} open assignments)`)
  }
  return lines.join('\n')
}

/** Format an assignee open-task-count list into a one-line workload signal (Plan §7.4). */
export function formatTeamWorkload(rows: Array<{ name: string; open: number }>): string {
  if (rows.length === 0) return ''
  const parts = rows.map((r) => `${r.name}: ${r.open} open task${r.open === 1 ? '' : 's'}`)
  return `Current assignee workload — ${parts.join('; ')}`
}

/**
 * Validate/normalize model-produced suggestions against the trigger/action
 * whitelists, coercing params to a string map and dropping anything invalid.
 * Pure so the parsing contract is unit-tested without a model. Extracted from
 * the raw text so both the AI and fallback paths share one shape.
 */
export function sanitizeAutomationSuggestions(raw: unknown): AutomationSuggestion[] {
  if (!Array.isArray(raw)) return []
  const result: AutomationSuggestion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const trig = (o.trigger ?? {}) as Record<string, unknown>
    const trigType = typeof trig.type === 'string' ? trig.type : ''
    if (!SUGGESTION_TRIGGERS.has(trigType)) continue

    const rawActions = Array.isArray(o.actions) ? o.actions : []
    const actions: Array<{ type: string; params: Record<string, string> }> = []
    for (const a of rawActions) {
      if (!a || typeof a !== 'object') continue
      const ao = a as Record<string, unknown>
      const type = typeof ao.type === 'string' ? ao.type : ''
      if (!SUGGESTION_ACTIONS.has(type)) continue
      actions.push({ type, params: toStringMap(ao.params) })
    }
    if (actions.length === 0) continue

    result.push({
      name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 120) : 'Suggested automation',
      trigger: { type: trigType, filters: toStringMap(trig.filters) },
      actions,
      rationale: typeof o.rationale === 'string' ? o.rationale.trim().slice(0, 400) : '',
    })
  }
  return result
}

/** JSON.parse that returns undefined instead of throwing on malformed input. */
function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Coerce an unknown object into a flat Record<string,string> (numbers/bools stringified). */
function toStringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
      else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v)
    }
  }
  return out
}

/**
 * Deterministic fallback used when AI is unavailable or returns nothing usable.
 * Derives 2-4 sensible rules from the behavior stats and always returns >= 2.
 * Pure + testable.
 */
export function deterministicAutomationSuggestions(b: AutomationBehavior): AutomationSuggestion[] {
  const out: AutomationSuggestion[] = []

  const top = b.statusTransitions.find((t) => t.to)
  if (top) {
    out.push({
      name: `Notify when tasks move to ${top.to}`,
      trigger: { type: 'task.status_changed', filters: { toStatus: top.to } },
      actions: [{ type: 'send_notification', params: { message: `A task moved to ${top.to}.` } }],
      rationale: `Tasks moved to "${top.to}" ${top.count} time(s) recently — the most common transition in your workspace.`,
    })
  }
  if (b.overdueCount > 0) {
    out.push({
      name: 'Escalate overdue tasks to urgent',
      trigger: { type: 'task.overdue', filters: {} },
      actions: [{ type: 'set_priority', params: { priority: 'urgent' } }],
      rationale: `${b.overdueCount} task(s) are currently overdue — auto-escalating keeps them visible.`,
    })
  }
  if (b.commentActivityCount >= 3) {
    out.push({
      name: 'Capture follow-ups from discussion',
      trigger: { type: 'task.comment_added', filters: {} },
      actions: [{ type: 'create_subtask', params: { title: 'Follow-up from discussion' } }],
      rationale: `Comment activity is high (${b.commentActivityCount} recently) — turn discussion into tracked follow-ups.`,
    })
  }

  // Guarantee at least two suggestions even for a quiet/new workspace.
  const defaults: AutomationSuggestion[] = [
    {
      name: 'Notify on overdue',
      trigger: { type: 'task.overdue', filters: {} },
      actions: [{ type: 'send_notification', params: { message: 'A task is overdue.' } }],
      rationale: 'A safe starting rule while your workspace builds up activity history.',
    },
    {
      name: 'Announce new tasks',
      trigger: { type: 'task.created', filters: {} },
      actions: [{ type: 'send_notification', params: { message: 'A new task was created.' } }],
      rationale: 'Keep the team aware as new work comes in.',
    },
  ]
  for (const d of defaults) {
    if (out.length >= 2) break
    if (!out.some((s) => s.trigger.type === d.trigger.type)) out.push(d)
  }
  return out.slice(0, 4)
}

// ─── Comment sentiment (Plan §7.13 project-health component) ──────────────────

export type SentimentLabel = 'positive' | 'neutral' | 'negative'
export type SentimentResult = {
  /** 0–100: share of comments reading positive (neutral counts half). */
  score: number
  label: SentimentLabel
  positive: number
  negative: number
  samples: number
  source: 'ai' | 'deterministic'
}

const POSITIVE_SENTIMENT_WORDS = [
  'thanks', 'thank', 'great', 'good', 'nice', 'awesome', 'excellent', 'perfect', 'love', 'done',
  'resolved', 'fixed', 'solved', 'shipped', 'approved', 'ready', 'works', 'working', 'complete',
  'completed', 'lgtm', 'progress', 'win', 'on track',
]
const NEGATIVE_SENTIMENT_WORDS = [
  'blocked', 'blocker', 'broken', 'bug', 'issue', 'problem', 'fail', 'failed', 'failing', 'error',
  'delay', 'delayed', 'stuck', 'urgent', 'wrong', 'cannot', "can't", 'cant', "won't", 'wont',
  'missing', 'risk', 'concern', 'worried', 'confusing', 'unclear', 'slipping', 'behind', 'overdue',
  'regression', 'crash',
]

/** Classify one comment as +1 / 0 / -1 by keyword hit counts (case-insensitive). */
function classifyComment(text: string): -1 | 0 | 1 {
  const t = ` ${(text ?? '').toLowerCase()} `
  let pos = 0
  let neg = 0
  for (const w of POSITIVE_SENTIMENT_WORDS) if (t.includes(w)) pos++
  for (const w of NEGATIVE_SENTIMENT_WORDS) if (t.includes(w)) neg++
  if (pos > neg) return 1
  if (neg > pos) return -1
  return 0
}

/**
 * Deterministic keyword sentiment over a set of comment bodies (Plan §7.13).
 * Pure + testable — the always-on fallback when the model is unavailable.
 * `score` is the share of comments that read positive (neutral counts half),
 * so an empty set is a neutral 50.
 */
export function analyzeSentimentDeterministic(texts: string[]): SentimentResult {
  const bodies = (texts ?? []).map((t) => (t ?? '').trim()).filter((t) => t.length > 0)
  let positive = 0
  let negative = 0
  for (const body of bodies) {
    const c = classifyComment(body)
    if (c === 1) positive++
    else if (c === -1) negative++
  }
  const samples = bodies.length
  const neutral = samples - positive - negative
  const score = samples === 0 ? 50 : Math.round(((positive + neutral * 0.5) / samples) * 100)
  const label: SentimentLabel = score >= 60 ? 'positive' : score <= 40 ? 'negative' : 'neutral'
  return { score, label, positive, negative, samples, source: 'deterministic' }
}

// ─── Daily AI briefing (Plan §7.11) ───────────────────────────────────────────

export type BriefingData = {
  displayName: string
  /** Task titles due today, blocking others, overdue, and at-risk soon. */
  dueToday: string[]
  overdue: string[]
  blocking: string[]
  atRisk: string[]
}

/** True when the briefing has at least one noteworthy item across all buckets. */
export function briefingHasContent(data: BriefingData): boolean {
  return (
    data.overdue.length > 0 ||
    data.dueToday.length > 0 ||
    data.blocking.length > 0 ||
    data.atRisk.length > 0
  )
}

/** Join a small set of task titles into a readable clause, capped for length. */
function briefingList(titles: string[], max = 3): string {
  const shown = titles.slice(0, max)
  const extra = titles.length - shown.length
  const joined = shown.map((t) => `“${t}”`).join(', ')
  return extra > 0 ? `${joined} (+${extra} more)` : joined
}

/**
 * Deterministic daily-briefing text (Plan §7.11). Pure + testable — the always-on
 * fallback used when the model is unavailable (ANTHROPIC_API_KEY unset). Leads
 * with the most urgent buckets (overdue, then blocking others, then due-today,
 * then at-risk) and always returns a non-empty, human-readable body.
 */
export function formatBriefingFallback(data: BriefingData): string {
  const parts: string[] = []
  const first = (data.displayName || '').trim().split(/\s+/)[0] || 'there'
  if (data.overdue.length)
    parts.push(`You have ${data.overdue.length} overdue task${data.overdue.length === 1 ? '' : 's'}: ${briefingList(data.overdue)}.`)
  if (data.blocking.length)
    parts.push(`${data.blocking.length} of your task${data.blocking.length === 1 ? ' is' : 's are'} blocking others: ${briefingList(data.blocking)}.`)
  if (data.dueToday.length)
    parts.push(`${data.dueToday.length} due today: ${briefingList(data.dueToday)}.`)
  if (data.atRisk.length)
    parts.push(`${data.atRisk.length} at risk soon: ${briefingList(data.atRisk)}.`)
  return parts.length
    ? `Good morning, ${first}. ${parts.join(' ')}`
    : `Good morning, ${first}. Nothing urgent on your plate today — a good time to get ahead.`
}

// ─── Smart task suggestions (Plan §7.10) ──────────────────────────────────────

export type TaskPriorityValue = 'urgent' | 'high' | 'normal' | 'low'
export type TaskSuggestion = { title: string; priority?: TaskPriorityValue }
export type SimilarProject = { id: string; name: string; taskTitles: string[]; score: number }

const TASK_PRIORITY_VALUES = new Set<TaskPriorityValue>(['urgent', 'high', 'normal', 'low'])
const PROJECT_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'project', 'app', 'new', 'v1', 'v2',
])

/** Tokenize a project name/description into a lowercased keyword set (stopwords + short words removed). Pure. */
export function projectKeywords(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of (text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    const w = raw.trim()
    if (w.length >= 3 && !PROJECT_STOPWORDS.has(w)) out.add(w)
  }
  return out
}

/**
 * Similarity between a target project name and a candidate name by keyword
 * overlap (Jaccard) plus a substring-containment bonus. Range 0–1. Pure + testable.
 */
export function projectSimilarity(target: string, candidate: string): number {
  const a = projectKeywords(target)
  const b = projectKeywords(candidate)
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  const union = new Set([...a, ...b]).size
  const jaccard = union === 0 ? 0 : shared / union
  const ta = target.trim().toLowerCase()
  const tc = candidate.trim().toLowerCase()
  const contains = ta && tc && (tc.includes(ta) || ta.includes(tc)) ? 0.25 : 0
  return Math.min(1, jaccard + contains)
}

/**
 * Rank candidate projects by similarity to the target name; keep those with any
 * signal, or fall back to the most recent few when nothing matches. Pure + testable.
 */
export function rankSimilarProjects(
  target: string,
  candidates: Array<{ id: string; name: string; taskTitles: string[] }>,
  limit = 5,
): SimilarProject[] {
  const scored: SimilarProject[] = candidates.map((c) => ({ ...c, score: projectSimilarity(target, c.name) }))
  scored.sort((a, b) => b.score - a.score)
  const withSignal = scored.filter((c) => c.score > 0)
  return (withSignal.length ? withSignal : scored).slice(0, limit)
}

/** Normalize a task title for case/space-insensitive frequency counting. */
function taskTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Deterministic task suggestions (Plan §7.10 fallback): the most-frequent task
 * titles across the similar projects, most common first (a title is counted at
 * most once per project so one large project can't dominate). Pure + testable —
 * the always-on fallback when the model is unavailable.
 */
export function deterministicTaskSuggestions(similar: SimilarProject[], limit = 8): TaskSuggestion[] {
  const freq = new Map<string, { title: string; count: number }>()
  for (const p of similar) {
    const seen = new Set<string>()
    for (const raw of p.taskTitles) {
      const title = (raw ?? '').trim()
      if (!title) continue
      const key = taskTitleKey(title)
      if (seen.has(key)) continue
      seen.add(key)
      const cur = freq.get(key)
      if (cur) cur.count++
      else freq.set(key, { title, count: 1 })
    }
  }
  return [...freq.values()]
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((f) => ({ title: f.title }))
}

/** Validate/normalize model task suggestions against the priority whitelist, de-duping by title. Pure. */
export function sanitizeTaskSuggestions(raw: unknown, limit = 10): TaskSuggestion[] {
  if (!Array.isArray(raw)) return []
  const out: TaskSuggestion[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    let title = ''
    let priority: TaskPriorityValue | undefined
    if (typeof item === 'string') title = item
    else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      title = typeof o.title === 'string' ? o.title : ''
      if (typeof o.priority === 'string' && TASK_PRIORITY_VALUES.has(o.priority as TaskPriorityValue)) {
        priority = o.priority as TaskPriorityValue
      }
    }
    title = title.trim().replace(/^\d+[.)]\s*/, '').slice(0, 200)
    if (!title) continue
    const key = taskTitleKey(title)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(priority ? { title, priority } : { title })
    if (out.length >= limit) break
  }
  return out
}

/** Human-readable "learned from" basis line for the suggestions response. Pure. */
export function summarizeSuggestionBasis(similar: SimilarProject[]): string {
  const named = similar.filter((p) => p.taskTitles.length > 0).map((p) => p.name)
  if (named.length === 0) return 'No similar projects with tasks yet — suggesting a common starter task list.'
  const shown = named.slice(0, 4)
  const extra = named.length - shown.length
  return `Learned from ${named.length} similar project${named.length === 1 ? '' : 's'}: ${shown.join(', ')}${extra > 0 ? `, +${extra} more` : ''}.`
}

// ─── Smart workload balancing (Plan §7.12) ────────────────────────────────────

export type WorkloadLoad = { userId: string; name: string; open: number; taskIds: string[] }
export type WorkloadMove = {
  fromUserId: string
  fromName: string
  toUserId: string
  toName: string
  count: number
  taskIds: string[]
  rationale: string
  source: 'ai' | 'heuristic'
}
export type WorkloadBalanceResult = {
  source: 'ai' | 'heuristic'
  average: number
  loads: Array<{ userId: string; name: string; open: number }>
  suggestions: WorkloadMove[]
}

/**
 * Deterministic workload redistribution (Plan §7.12 fallback): greedily pair the
 * most-overloaded assignee with the least-loaded one and propose moving enough
 * tasks to close ~half the gap, drawing the specific task ids from the
 * overloaded assignee. Only rebalances a real imbalance (source above the team
 * average, gap ≥ 2). Pure + testable.
 */
export function computeWorkloadBalance(
  loads: WorkloadLoad[],
  opts: { source?: 'ai' | 'heuristic'; maxSuggestions?: number } = {},
): WorkloadBalanceResult {
  const source = opts.source ?? 'heuristic'
  const maxSuggestions = opts.maxSuggestions ?? 3
  const people = loads.map((l) => ({ userId: l.userId, name: l.name, remaining: [...l.taskIds] }))
  const total = loads.reduce((s, l) => s + l.open, 0)
  const roundedAvg = loads.length ? Math.round((total / loads.length) * 10) / 10 : 0

  const load = new Map(loads.map((l) => [l.userId, l.open]))
  const suggestions: WorkloadMove[] = []
  for (let i = 0; i < maxSuggestions; i++) {
    const sorted = [...people].sort((a, b) => (load.get(b.userId) ?? 0) - (load.get(a.userId) ?? 0))
    const from = sorted[0]
    const to = sorted[sorted.length - 1]
    if (!from || !to || from.userId === to.userId) break
    const fromLoad = load.get(from.userId) ?? 0
    const toLoad = load.get(to.userId) ?? 0
    const gap = fromLoad - toLoad
    if (fromLoad <= roundedAvg || gap < 2) break
    const move = Math.min(Math.floor(gap / 2), from.remaining.length)
    if (move < 1) break
    const taskIds = from.remaining.splice(0, move)
    load.set(from.userId, fromLoad - move)
    load.set(to.userId, toLoad + move)
    suggestions.push({
      fromUserId: from.userId,
      fromName: from.name,
      toUserId: to.userId,
      toName: to.name,
      count: move,
      taskIds,
      rationale: `${from.name} has ${fromLoad} open tasks vs ${to.name}'s ${toLoad}; moving ${move} rebalances toward the team average of ${roundedAvg}.`,
      source,
    })
  }
  return {
    source,
    average: roundedAvg,
    loads: loads.map((l) => ({ userId: l.userId, name: l.name, open: l.open })),
    suggestions,
  }
}

/**
 * Identify assignees significantly overloaded relative to the team (Plan §7.12
 * proactive alert): open count ≥ `absoluteMin` AND ≥ team average × `factor`.
 * Pure + testable.
 */
export function findOverloadedAssignees(
  loads: Array<{ userId: string; name: string; open: number }>,
  opts: { factor?: number; absoluteMin?: number } = {},
): Array<{ userId: string; name: string; open: number; average: number }> {
  const factor = opts.factor ?? 1.5
  const absoluteMin = opts.absoluteMin ?? 6
  if (loads.length < 2) return []
  const total = loads.reduce((s, l) => s + l.open, 0)
  const average = total / loads.length
  const roundedAvg = Math.round(average * 10) / 10
  return loads
    .filter((l) => l.open >= absoluteMin && l.open >= average * factor)
    .sort((a, b) => b.open - a.open)
    .map((l) => ({ userId: l.userId, name: l.name, open: l.open, average: roundedAvg }))
}

/**
 * Map model-proposed workload moves ({fromUserId,toUserId,count}) onto the REAL
 * per-assignee loads, resolving the actual task ids server-side (never trusting
 * model-invented ids) and clamping counts to what the source actually has.
 * Pure + testable.
 */
export function mapAiWorkloadMoves(raw: unknown, loads: WorkloadLoad[]): WorkloadBalanceResult {
  const byId = new Map(loads.map((l) => [l.userId, { name: l.name, remaining: [...l.taskIds] }]))
  const total = loads.reduce((s, l) => s + l.open, 0)
  const average = loads.length ? Math.round((total / loads.length) * 10) / 10 : 0
  const suggestions: WorkloadMove[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const from = typeof o.fromUserId === 'string' ? byId.get(o.fromUserId) : undefined
      const to = typeof o.toUserId === 'string' ? byId.get(o.toUserId) : undefined
      const fromId = typeof o.fromUserId === 'string' ? o.fromUserId : ''
      const toId = typeof o.toUserId === 'string' ? o.toUserId : ''
      if (!from || !to || fromId === toId || from.remaining.length === 0) continue
      const want = Math.max(1, Math.min(Math.trunc(Number(o.count) || 1), from.remaining.length))
      const taskIds = from.remaining.splice(0, want)
      suggestions.push({
        fromUserId: fromId,
        fromName: from.name,
        toUserId: toId,
        toName: to.name,
        count: taskIds.length,
        taskIds,
        rationale:
          typeof o.rationale === 'string' && o.rationale.trim()
            ? o.rationale.trim().slice(0, 300)
            : `Move ${taskIds.length} task${taskIds.length === 1 ? '' : 's'} from ${from.name} to ${to.name} to balance load.`,
        source: 'ai',
      })
      if (suggestions.length >= 3) break
    }
  }
  return {
    source: 'ai',
    average,
    loads: loads.map((l) => ({ userId: l.userId, name: l.name, open: l.open })),
    suggestions,
  }
}

@Injectable()
export class AiService {
  private client: Anthropic | null = null

  constructor(
    private config: ConfigService,
    @Inject(DB_TOKEN) private db: Db,
    private tasks: TasksService,
    // §15.1 Knowledge base retrieval. SearchService is retained for other
    // surfaces; knowledge now retrieves via vector similarity (EmbeddingService
    // + knowledge_embeddings). Both are @Optional so the many unit tests that
    // construct `new AiService(config, db, tasks)` keep compiling; injected in
    // production (SearchModule is @Global; EmbeddingService lives in AiModule).
    @Optional() private search?: SearchService,
    @Optional() private embeddings?: EmbeddingService,
    // §15.1 — used to hydrate attachment hits with their extracted text at
    // answer-time (the embeddings table stores only title/url). @Optional so the
    // many `new AiService(config, db, tasks)` unit constructions keep compiling;
    // injected in production (StorageModule is @Global). When absent, attachment
    // citations simply carry no body — the answer path degrades gracefully.
    @Optional() private r2?: R2Service,
  ) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY')
    if (apiKey) {
      this.client = new Anthropic({ apiKey })
    }
  }

  private get claude() {
    if (!this.client) {
      throw new Error('ANTHROPIC_API_KEY is not configured')
    }
    return this.client
  }

  private get hourlyLimit(): number {
    const v = Number(this.config.get<string>('AI_HOURLY_LIMIT'))
    return Number.isFinite(v) && v > 0 ? v : 200
  }

  /**
   * Enforce a per-user hourly AI call cap (Plan §7.15 "per-user rate limits").
   * Throws 429 when exceeded. No-op for calls without a user context.
   */
  private get orgHourlyLimit(): number {
    const v = Number(this.config.get<string>('AI_ORG_HOURLY_LIMIT'))
    return Number.isFinite(v) && v > 0 ? v : 2000
  }

  async assertWithinRateLimit(ctx: AiCtx, now: Date = new Date()) {
    const since = new Date(now.getTime() - 3_600_000)
    if (ctx.userId) {
      const [row] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(aiUsage)
        .where(and(eq(aiUsage.userId, ctx.userId), gte(aiUsage.createdAt, since)))
      if ((row?.c ?? 0) >= this.hourlyLimit) {
        throw new HttpException(
          `AI hourly rate limit reached (${this.hourlyLimit}/hour). Try again later.`,
          HttpStatus.TOO_MANY_REQUESTS,
        )
      }
    }
    // Per-organization (workspace) cap (Plan §7.15).
    if (ctx.workspaceId) {
      const [row] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(aiUsage)
        .where(and(eq(aiUsage.workspaceId, ctx.workspaceId), gte(aiUsage.createdAt, since)))
      if ((row?.c ?? 0) >= this.orgHourlyLimit) {
        throw new HttpException(
          `Workspace AI hourly limit reached (${this.orgHourlyLimit}/hour). Try again later.`,
          HttpStatus.TOO_MANY_REQUESTS,
        )
      }
    }
  }

  /**
   * Create a message: rate-limit, enable prompt caching on the system block,
   * and record token usage (Plan §7.15). All non-streaming AI calls route here.
   */
  private async complete(
    feature: string,
    ctx: AiCtx,
    params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  ) {
    await this.assertWithinRateLimit(ctx)
    // Prompt caching: mark the (repeated) system prompt as a cache breakpoint.
    const finalParams: Anthropic.Messages.MessageCreateParamsNonStreaming =
      typeof params.system === 'string' && params.system.length > 200
        ? { ...params, system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }] }
        : params
    const response = await this.claude.messages.create(finalParams)
    void this.recordUsage(feature, params.model, ctx, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0)
    return response
  }

  async recordUsage(feature: string, model: string, ctx: AiCtx, inputTokens: number, outputTokens: number) {
    try {
      await this.db.insert(aiUsage).values({
        workspaceId: ctx.workspaceId ?? null,
        userId: ctx.userId ?? null,
        feature,
        model,
        inputTokens,
        outputTokens,
      })
    } catch {
      // Usage tracking must never break an AI response.
    }
  }

  /** Aggregate AI usage + estimated cost, per user and per model (Plan §7.15). */
  async usageSummary(opts: { workspaceId?: string; from?: Date; to?: Date; actor?: { id: string; role?: string } } = {}) {
    // §A4.4 — this became a rendered screen, so the scope check has to be real:
    // spend and per-person usage is workspace-confidential. No workspaceId means
    // the platform-wide roll-up, which is a super-admin view.
    if (opts.actor && opts.actor.role !== 'super_admin') {
      if (!opts.workspaceId) throw new ForbiddenException('Workspace context required')
      const [member] = await this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, opts.workspaceId),
            eq(workspaceMembers.userId, opts.actor.id),
          ),
        )
        .limit(1)
      if (!member) throw new ForbiddenException('Workspace membership required')
    }

    const filters = []
    if (opts.workspaceId) filters.push(eq(aiUsage.workspaceId, opts.workspaceId))
    if (opts.from) filters.push(gte(aiUsage.createdAt, opts.from))
    if (opts.to) filters.push(lte(aiUsage.createdAt, opts.to))
    const where = filters.length ? and(...filters) : undefined

    const rows = await this.db
      .select({
        userId: aiUsage.userId,
        model: aiUsage.model,
        inTok: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::int`,
        outTok: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::int`,
        calls: sql<number>`count(*)::int`,
      })
      .from(aiUsage)
      .where(where)
      .groupBy(aiUsage.userId, aiUsage.model)

    let totalCost = 0
    let totalCalls = 0
    let totalIn = 0
    let totalOut = 0
    const byUser: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }> = {}
    const byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }> = {}
    for (const r of rows) {
      const cost = estimateAiCostUsd(r.model, r.inTok, r.outTok)
      totalCost += cost
      totalCalls += r.calls
      totalIn += r.inTok
      totalOut += r.outTok
      const u = (byUser[r.userId ?? 'unknown'] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 })
      u.calls += r.calls; u.inputTokens += r.inTok; u.outputTokens += r.outTok; u.costUsd += cost
      const m = (byModel[r.model] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 })
      m.calls += r.calls; m.inputTokens += r.inTok; m.outputTokens += r.outTok; m.costUsd += cost
    }
    const round = (n: number) => Math.round(n * 10000) / 10000
    return {
      totals: { calls: totalCalls, inputTokens: totalIn, outputTokens: totalOut, costUsd: round(totalCost) },
      byUser: Object.fromEntries(Object.entries(byUser).map(([k, v]) => [k, { ...v, costUsd: round(v.costUsd) }])),
      byModel: Object.fromEntries(Object.entries(byModel).map(([k, v]) => [k, { ...v, costUsd: round(v.costUsd) }])),
    }
  }

  // ─── Task generation from a natural language prompt ───────────────────────
  async generateTask(
    prompt: string,
    context?: string,
    ctx: AiCtx = {},
    customFields?: Array<{ name: string; type: string; options?: string[] }>,
  ): Promise<{
    title: string
    description: string
    subtasks: string[]
    priority: 'urgent' | 'high' | 'normal' | 'low'
    estimatedHours?: number
    customFieldValues?: Array<{ fieldName: string; value: string | number | boolean }>
  }> {
    // When the destination project has custom fields, let the model suggest
    // values for them (resolved by name on save, like the task-template path).
    const fieldsBlock = customFields?.length
      ? `\nThe destination project has these custom fields — suggest values ONLY for fields you can confidently fill, as a "customFieldValues" array of { "fieldName": string, "value": string|number|boolean }. Use the EXACT field name. Omit fields you cannot fill.\n${customFields
          .map((f) => `- ${f.name} (${f.type}${f.options?.length ? `: ${f.options.join(', ')}` : ''})`)
          .join('\n')}`
      : ''

    const systemPrompt = `You are a project management assistant for Rundesk.
When given a natural language description, generate a structured task definition.
Respond ONLY with valid JSON matching this exact shape:
{
  "title": "string (concise, action-oriented)",
  "description": "string (detailed markdown description)",
  "subtasks": ["string", ...],
  "priority": "urgent" | "high" | "normal" | "low",
  "estimatedHours": number | null${customFields?.length ? ',\n  "customFieldValues": [{ "fieldName": "string", "value": "string|number|boolean" }]' : ''}
}
${context ? `\nWorkspace context:\n${context}` : ''}${fieldsBlock}`

    const response = await this.complete('task.generate', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Create a task for: ${prompt}` }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) throw new Error('AI returned invalid response')
    return JSON.parse(jsonMatch[0])
  }

  // ─── Meeting notes → action items ─────────────────────────────────────────
  async extractTasksFromNotes(notes: string, ctx: AiCtx = {}): Promise<Array<{
    title: string
    description: string
    assigneeName?: string
    dueDate?: string
    priority: string
  }>> {
    const response = await this.complete('meeting.notes', ctx, {
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `You are a meeting notes analyzer for Rundesk.
Extract all action items from the meeting notes and return them as a JSON array.
Each action item should have: title, description, assigneeName (if mentioned), dueDate (ISO 8601 if mentioned, else null), priority (urgent/high/normal/low).
Respond ONLY with a valid JSON array.`,
      messages: [{ role: 'user', content: `Meeting notes:\n\n${notes}` }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
    const jsonMatch = text.match(/\[[\s\S]+\]/)
    if (!jsonMatch) return []
    return JSON.parse(jsonMatch[0])
  }

  // ─── Auto-priority detection ──────────────────────────────────────────────
  async suggestPriority(title: string, description?: string, ctx: AiCtx = {}): Promise<{
    priority: 'urgent' | 'high' | 'normal' | 'low'
    reasoning: string
  }> {
    const response = await this.complete('task.priority', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: `You are a task prioritizer. Given a task title and optional description, suggest the appropriate priority.
Respond ONLY with valid JSON: { "priority": "urgent" | "high" | "normal" | "low", "reasoning": "string" }`,
      messages: [
        {
          role: 'user',
          content: `Task: ${title}${description ? `\n\nDescription: ${description}` : ''}`,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) return { priority: 'normal', reasoning: 'Could not determine priority' }
    return JSON.parse(jsonMatch[0])
  }

  // ─── Task / Project summary ───────────────────────────────────────────────
  async summarize(content: string, type: 'task' | 'project' = 'task', ctx: AiCtx = {}): Promise<string> {
    const response = await this.complete('summarize', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: `You are a concise summarizer for Rundesk.
Write a 2-3 sentence summary of the given ${type} content in plain text.
Focus on the key goals, current status, and any blockers.`,
      messages: [{ role: 'user', content: content }],
    })

    return response.content[0].type === 'text' ? response.content[0].text : ''
  }

  // ─── Writing assistant ────────────────────────────────────────────────────
  async improveWriting(
    text: string,
    mode: 'improve' | 'shorten' | 'expand' | 'format' = 'improve',
    ctx: AiCtx = {},
  ): Promise<string> {
    const instructions: Record<string, string> = {
      improve: 'Improve the clarity, grammar, and professionalism of this text while keeping the same meaning.',
      shorten: 'Shorten this text to its essential points without losing meaning.',
      expand: 'Expand this text with more detail and context.',
      format: 'Reformat this text with proper markdown: headings, bullet points, bold for key terms.',
    }

    const response = await this.complete('writing.improve', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: `You are a writing assistant. ${instructions[mode]} Return ONLY the improved text.`,
      messages: [{ role: 'user', content: text }],
    })

    return response.content[0].type === 'text' ? response.content[0].text : text
  }

  // ─── AI Chatbot (streaming) ───────────────────────────────────────────────
  async chatStream(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    workspaceContext: string,
    res: Response,
    ctx: AiCtx = {},
    /**
     * §15 — the skill being answered as, already rendered by SkillsService
     * (playbook + memory + connections + the no-unattended-action boundary).
     *
     * It goes *first* in the system prompt, ahead of the generic assistant
     * description: last-writer-wins on conflicting instructions is the wrong
     * way round here — a skill that says "be blunt" must not be overruled by a
     * default two lines below it. The generic text then reads as the fallback
     * it is, and the skill's own boundary sentence is the last word.
     */
    skillPrompt?: string,
  ): Promise<void> {
    // Enforce rate limits before we hijack the reply for streaming.
    await this.assertWithinRateLimit(ctx)

    const intro = skillPrompt?.trim()
      ? skillPrompt.trim()
      : `You are Rundesk AI, an intelligent assistant embedded in the Rundesk project management platform.
You help users manage tasks, understand their workspace, draft messages, generate content, and answer questions.
Be concise, helpful, and action-oriented.`

    const systemPrompt = `${intro}

Workspace context:
${workspaceContext}

Current date: ${new Date().toISOString().split('T')[0]}`

    // This runs on Fastify, whose reply has no setHeader/write/end — use the
    // underlying Node response (reply.raw) and hijack the reply so Fastify
    // doesn't also try to send one.
    const reply = res as any
    if (typeof reply.hijack === 'function') reply.hijack()
    const raw = reply.raw ?? reply
    raw.setHeader('Content-Type', 'text/event-stream')
    raw.setHeader('Cache-Control', 'no-cache')
    raw.setHeader('Connection', 'keep-alive')
    raw.flushHeaders?.()

    try {
      const stream = this.claude.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        // Cache the (large, repeated) system context across turns.
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
      })

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          raw.write(`data: ${JSON.stringify({ delta: chunk.delta.text })}\n\n`)
        }
      }
      const final = await stream.finalMessage().catch(() => null)
      void this.recordUsage(
        'chat',
        'claude-sonnet-4-6',
        ctx,
        final?.usage?.input_tokens ?? 0,
        final?.usage?.output_tokens ?? 0,
      )
      raw.write('data: [DONE]\n\n')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI request failed'
      raw.write(`data: ${JSON.stringify({ error: message })}\n\n`)
    } finally {
      raw.end()
    }
  }

  /**
   * Non-streaming chatbot reply (Plan §7.6) — used when @Rundesk is mentioned
   * in a channel so the answer can be posted as a normal message.
   */
  async chatReply(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    workspaceContext: string,
    ctx: AiCtx = {},
    /**
     * §15 — answering as a skill invoked by its slash command. First in the
     * prompt and replacing the generic description, for the same reason as
     * `chatStream`: a skill that asks for a particular voice must not be
     * overruled by a default two lines below it.
     */
    skillPrompt?: string,
  ): Promise<string> {
    const intro = skillPrompt?.trim()
      ? skillPrompt.trim()
      : `You are Rundesk AI, an assistant inside the Rundesk project management chat.
A teammate mentioned you (@Rundesk). Answer helpfully and concisely in 1-4 sentences.`
    const systemPrompt = `${intro}

Workspace context:
${workspaceContext}

Current date: ${new Date().toISOString().split('T')[0]}`
    const response = await this.complete('chat.mention', ctx, {
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: systemPrompt,
      messages,
    })
    return response.content[0]?.type === 'text' ? response.content[0].text : ''
  }

  /**
   * Build a real workspace context string for the chatbot (Plan §7.6/§7.15):
   * the user's role, workspace structure (space/project/list counts + names),
   * their open assigned tasks, and their recent task history (last 90 days) —
   * plus an optional current-view hint from the caller — so answers are grounded
   * instead of a workspace-ID stub. Token-bounded via `formatWorkspaceContext`.
   */
  async buildWorkspaceContext(
    workspaceId: string,
    userId: string,
    opts: { currentView?: string } = {},
  ): Promise<string> {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      const [[wsRow], [roleRow], [counts], spaceRows, projectRows, openTasks, history] = await Promise.all([
        this.db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
        this.db
          .select({ role: workspaceMembers.role })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
          .limit(1),
        this.db
          .select({
            spaces: sql<number>`count(distinct ${spaces.id})::int`,
            projects: sql<number>`count(distinct ${projects.id})::int`,
            lists: sql<number>`count(distinct ${lists.id})::int`,
            openTasks: sql<number>`count(distinct case when ${tasks.statusCategory} <> 'closed' and ${tasks.isArchived} = false then ${tasks.id} end)::int`,
          })
          .from(spaces)
          .leftJoin(projects, eq(projects.spaceId, spaces.id))
          .leftJoin(lists, eq(lists.projectId, projects.id))
          .leftJoin(tasks, eq(tasks.listId, lists.id))
          .where(eq(spaces.workspaceId, workspaceId)),
        this.db
          .select({ id: spaces.id, name: spaces.name })
          .from(spaces)
          .where(eq(spaces.workspaceId, workspaceId))
          .orderBy(asc(spaces.name))
          .limit(20),
        this.db
          .select({ id: projects.id, name: projects.name, spaceId: projects.spaceId })
          .from(projects)
          .innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .where(eq(spaces.workspaceId, workspaceId))
          .orderBy(asc(projects.name))
          .limit(60),
        this.db
          .select({ title: tasks.title, dueDate: tasks.dueDate, priority: tasks.priority })
          .from(tasks)
          .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
          .innerJoin(lists, eq(lists.id, tasks.listId))
          .innerJoin(projects, eq(projects.id, lists.projectId))
          .innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .where(
            and(
              eq(spaces.workspaceId, workspaceId),
              eq(taskAssignees.userId, userId),
              eq(tasks.isArchived, false),
              ne(tasks.statusCategory, 'closed'),
            ),
          )
          .orderBy(asc(tasks.dueDate))
          .limit(15),
        // Task history (Plan §7.15): recently updated/completed tasks the user is
        // involved in (creator or assignee) within the last 90 days.
        this.db
          .select({ title: tasks.title, status: tasks.status, updatedAt: tasks.updatedAt })
          .from(tasks)
          .innerJoin(lists, eq(lists.id, tasks.listId))
          .innerJoin(projects, eq(projects.id, lists.projectId))
          .innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .where(
            and(
              eq(spaces.workspaceId, workspaceId),
              gte(tasks.updatedAt, cutoff),
              or(
                eq(tasks.createdById, userId),
                sql`exists (select 1 from ${taskAssignees} where ${taskAssignees.taskId} = ${tasks.id} and ${taskAssignees.userId} = ${userId})`,
              ),
            ),
          )
          .orderBy(desc(tasks.updatedAt))
          .limit(40),
      ])

      const projectsBySpace = new Map<string, string[]>()
      for (const p of projectRows) {
        const list = projectsBySpace.get(p.spaceId) ?? []
        list.push(p.name)
        projectsBySpace.set(p.spaceId, list)
      }
      return formatWorkspaceContext({
        workspaceName: wsRow?.name ?? 'Unknown',
        role: roleRow?.role ?? 'member',
        counts: {
          spaces: counts?.spaces ?? 0,
          projects: counts?.projects ?? 0,
          lists: counts?.lists ?? 0,
          openTasks: counts?.openTasks ?? 0,
        },
        spaces: spaceRows.map((s) => ({ name: s.name, projects: projectsBySpace.get(s.id) ?? [] })),
        openTasks,
        history,
        currentView: opts.currentView,
      })
    } catch {
      return `Workspace ID: ${workspaceId}`
    }
  }

  /**
   * Assemble an enriched summary input for a task (Plan §7.5): title, status,
   * priority and description plus recent activity, open subtasks, open blockers,
   * and recent comments — all read via TasksService. Bounded for token safety by
   * `formatTaskSummaryInput`.
   */
  async buildTaskSummaryInput(taskId: string): Promise<string> {
    const [[taskRow], activity, subtasks, blockers, comments] = await Promise.all([
      this.db
        .select({
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
        })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1),
      this.tasks.listActivity(taskId, 12),
      this.tasks.listSubtasks(taskId),
      this.tasks.getOpenBlockers(taskId),
      this.tasks.listComments(taskId),
    ])
    return formatTaskSummaryInput({
      title: taskRow?.title ?? '',
      description: taskRow?.description ?? null,
      status: taskRow?.status ?? null,
      priority: taskRow?.priority ?? null,
      activity: activity.map((a) => ({
        action: a.action,
        actor: a.actor?.displayName ?? a.actor?.email ?? null,
      })),
      subtasks: subtasks
        .filter((s) => s.statusCategory !== 'closed')
        .map((s) => ({ title: s.title, status: s.status })),
      blockers: blockers.map((b) => ({ title: b.title, status: b.status })),
      comments: (comments as Array<{ author?: { displayName?: string | null; email?: string | null } | null; body?: string | null }>).map((cm) => ({
        author: cm.author?.displayName ?? cm.author?.email ?? null,
        body: cm.body ?? '',
      })),
    })
  }

  /**
   * Streaming task/project summary (Plan §7.5) — mirrors `chatStream`'s SSE
   * framing (`{delta}` / `[DONE]` / `{error}`) so the client renders tokens as
   * they arrive. Uses the same model as the non-streaming `summarize`.
   */
  async summarizeStream(
    content: string,
    type: 'task' | 'project',
    res: Response,
    ctx: AiCtx = {},
  ): Promise<void> {
    await this.assertWithinRateLimit(ctx)

    const systemPrompt = `You are a concise summarizer for Rundesk.
Write a clear summary of the given ${type} in plain text (3-5 sentences).
Focus on the key goals, current status, recent activity, and any blockers or risks.`

    const reply = res as any
    if (typeof reply.hijack === 'function') reply.hijack()
    const raw = reply.raw ?? reply
    raw.setHeader('Content-Type', 'text/event-stream')
    raw.setHeader('Cache-Control', 'no-cache')
    raw.setHeader('Connection', 'keep-alive')
    raw.flushHeaders?.()

    try {
      const stream = this.claude.messages.stream({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: content || `(no ${type} content provided)` }],
      })

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          raw.write(`data: ${JSON.stringify({ delta: chunk.delta.text })}\n\n`)
        }
      }
      const final = await stream.finalMessage().catch(() => null)
      void this.recordUsage(
        'summarize',
        'claude-haiku-4-5',
        ctx,
        final?.usage?.input_tokens ?? 0,
        final?.usage?.output_tokens ?? 0,
      )
      raw.write('data: [DONE]\n\n')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI request failed'
      raw.write(`data: ${JSON.stringify({ error: message })}\n\n`)
    } finally {
      raw.end()
    }
  }

  // ─── Smart deadline suggestion ────────────────────────────────────────────
  async suggestDeadline(
    title: string,
    description?: string,
    teamWorkload?: string,
    ctx: AiCtx = {},
  ): Promise<{ suggestedDate: string; reasoning: string }> {
    const today = new Date().toISOString().split('T')[0]
    const response = await this.complete('task.deadline', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: `You are a project planning assistant. Today's date is ${today}.
Suggest a realistic due date for the given task based on its complexity, and — when
a "Team workload" line is provided — factor in how busy the assignees already are
(push the date out when they are heavily loaded). Mention the workload in your reasoning
when it influenced the date.
Respond ONLY with valid JSON: { "suggestedDate": "YYYY-MM-DD", "reasoning": "string" }`,
      messages: [
        {
          role: 'user',
          content: `Task: ${title}${description ? `\nDescription: ${description}` : ''}${teamWorkload ? `\nTeam workload: ${teamWorkload}` : ''}`,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) {
      const fallback = new Date()
      fallback.setDate(fallback.getDate() + 7)
      return { suggestedDate: fallback.toISOString().split('T')[0], reasoning: 'Default 7-day estimate' }
    }
    return JSON.parse(jsonMatch[0])
  }

  /**
   * Compact current-workload signal for a task's assignees (Plan §7.4): each
   * assignee's count of open (non-closed, non-archived) tasks across the
   * workspace. Returns undefined when the task has no assignees so the deadline
   * prompt omits the line entirely.
   */
  async buildTeamWorkloadSignal(taskId: string): Promise<string | undefined> {
    const assignees = await this.db
      .select({ userId: taskAssignees.userId, name: sql<string>`coalesce(${users.displayName}, ${users.email})` })
      .from(taskAssignees)
      .innerJoin(users, eq(users.id, taskAssignees.userId))
      .where(eq(taskAssignees.taskId, taskId))
    if (assignees.length === 0) return undefined

    const workspaceId = await this.resolveTaskWorkspaceId(taskId)
    if (!workspaceId) return undefined

    const ids = assignees.map((a) => a.userId)
    const counts = await this.db
      .select({ userId: taskAssignees.userId, count: sql<number>`count(*)::int` })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          inArray(taskAssignees.userId, ids),
          eq(spaces.workspaceId, workspaceId),
          eq(tasks.isArchived, false),
          sql`${tasks.statusCategory} <> 'closed'`,
        ),
      )
      .groupBy(taskAssignees.userId)
    const countByUser = new Map(counts.map((c) => [c.userId, c.count]))

    return formatTeamWorkload(
      assignees.map((a) => ({ name: a.name || 'Someone', open: countByUser.get(a.userId) ?? 0 })),
    )
  }

  /** Assert the caller is a member of the workspace (used by the suggestions endpoint). */
  async assertWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
    const role = await this.memberRole(workspaceId, userId)
    if (!role) throw new ForbiddenException('You do not have access to this workspace')
  }

  // ─── §15.1 Knowledge base — "Ask about your workspace" ────────────────────
  //
  // Retrieval-augmented over a REAL vector/embeddings store (NOT keyword
  // search): the question is embedded and ranked by cosine similarity against
  // the workspace's `knowledge_embeddings` (portable float8[] vectors, stored
  // L2-normalized so cosine == dot product). We take the top matches, assemble
  // a compact cited context, and answer with the model — falling back to the
  // ranked matches themselves (no fabrication) when AI is unavailable or errors.
  // Access control is honored end-to-end: `filterAccessibleHits` drops any
  // task/comment/doc in a private space/project the caller can't reach BEFORE
  // anything is cited or fed to the model.

  /** Bounded cap on candidate embedding rows fetched per workspace for ranking. */
  private get knowledgeCandidateCap(): number {
    const v = Number(this.config.get<string>('KNOWLEDGE_CANDIDATE_CAP'))
    return Number.isFinite(v) && v > 0 ? Math.trunc(v) : 5000
  }

  /**
   * Embed the question with the SAME embedder used at index-time (env-gated real
   * API or the deterministic local embedder). Falls back to the pure local
   * embedder if no EmbeddingService is injected (some unit-test constructions).
   */
  private async embedQuestion(text: string): Promise<number[]> {
    if (this.embeddings) return (await this.embeddings.embed(text)).vector
    return embedText(text)
  }

  /**
   * Retrieve the access-scoped, semantically-ranked hits that ground a knowledge
   * answer. Embeds the question, ranks the workspace's embeddings by cosine,
   * over-fetches the top candidates, then filters by container visibility.
   */
  async retrieveKnowledgeHits(
    workspaceId: string,
    userId: string,
    question: string,
    limit = 6,
  ): Promise<RawSearchHit[]> {
    const q = question.trim()
    if (!q) return []
    const queryVec = await this.embedQuestion(q)
    if (queryVec.length === 0) return []

    const rows = await this.db
      .select({
        sourceType: knowledgeEmbeddings.sourceType,
        sourceId: knowledgeEmbeddings.sourceId,
        title: knowledgeEmbeddings.title,
        url: knowledgeEmbeddings.url,
        embedding: knowledgeEmbeddings.embedding,
        dim: knowledgeEmbeddings.dim,
      })
      .from(knowledgeEmbeddings)
      .where(eq(knowledgeEmbeddings.workspaceId, workspaceId))
      .limit(this.knowledgeCandidateCap)

    const ranked = rows
      // Only compare vectors of the same dimensionality as the query (guards a
      // mid-flight embedder switch from mis-ranking stale rows).
      .filter((r) => Array.isArray(r.embedding) && r.embedding.length === queryVec.length && r.dim === queryVec.length)
      .map((r) => ({ r, score: cosineSimilarity(queryVec, r.embedding as number[]) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 3)

    const hits: RawSearchHit[] = ranked.map(({ r }) => ({
      id: `${r.sourceType}-${r.sourceId}`,
      entityType: r.sourceType,
      title: r.title,
      content: '',
      url: r.url,
    }))
    const accessible = await this.filterAccessibleHits(workspaceId, userId, hits)
    return accessible.slice(0, limit)
  }

  /**
   * Hydrate the (already access-filtered) top hits with their live source text,
   * so the model gets grounded context — the embeddings table stores only
   * title/url, not the body. Only used on the AI-answer path. Best-effort:
   * missing text just leaves the title as the citation.
   */
  private async enrichKnowledgeContent(hits: RawSearchHit[]): Promise<RawSearchHit[]> {
    const taskIds: string[] = []
    const docIds: string[] = []
    const commentIds: string[] = []
    const attachmentIds: string[] = []
    for (const h of hits) {
      const { type, rawId } = splitSearchId(h.id)
      if (type === 'task') taskIds.push(rawId)
      else if (type === 'doc') docIds.push(rawId)
      else if (type === 'comment') commentIds.push(rawId)
      else if (type === 'attachment') attachmentIds.push(rawId)
    }
    const [taskRows, docRows, commentRows] = await Promise.all([
      taskIds.length
        ? this.db.select({ id: tasks.id, text: tasks.description }).from(tasks).where(inArray(tasks.id, taskIds))
        : Promise.resolve([] as Array<{ id: string; text: string | null }>),
      docIds.length
        ? this.db.select({ id: docs.id, text: docs.plaintext }).from(docs).where(inArray(docs.id, docIds))
        : Promise.resolve([] as Array<{ id: string; text: string | null }>),
      commentIds.length
        ? this.db.select({ id: taskComments.id, text: taskComments.body }).from(taskComments).where(inArray(taskComments.id, commentIds))
        : Promise.resolve([] as Array<{ id: string; text: string | null }>),
    ])
    const byId = new Map<string, string>()
    for (const r of [...taskRows, ...docRows, ...commentRows]) byId.set(r.id, r.text ?? '')

    // Attachment bodies live in R2, not the DB — re-read + extract their text for
    // the top hits so the model can answer FROM attachment contents. Best-effort
    // and R2-gated: unconfigured storage or a missing/unreadable object just
    // leaves the filename as the citation (never throws on the answer path).
    if (attachmentIds.length > 0 && this.r2?.configured) {
      const r2 = this.r2
      const attachmentRows = await this.db
        .select({
          id: taskAttachments.id,
          storageKey: taskAttachments.storageKey,
          contentType: taskAttachments.contentType,
        })
        .from(taskAttachments)
        .where(inArray(taskAttachments.id, attachmentIds))
      await Promise.all(
        attachmentRows
          .filter((a) => isExtractableAttachment(a.contentType))
          .map(async (a) => {
            try {
              const bytes = await r2.getObject(a.storageKey)
              const text = extractAttachmentText(bytes, a.contentType, ATTACHMENT_TEXT_CAP)
              if (text) byId.set(a.id, text)
            } catch {
              // best-effort — leave the citation as the filename
            }
          }),
      )
    }

    return hits.map((h) => {
      const { rawId } = splitSearchId(h.id)
      const text = byId.get(rawId)
      return text ? { ...h, content: text } : h
    })
  }

  /**
   * Drop hits the caller isn't allowed to see. Workspace managers see
   * everything (mirrors SpacesService); everyone else is restricted to public
   * spaces/projects plus the private ones they're an explicit member of. User,
   * channel, and chat-message hits are already access-scoped by SearchService
   * and pass through unchanged.
   */
  private async filterAccessibleHits(
    workspaceId: string,
    userId: string,
    hits: RawSearchHit[],
  ): Promise<RawSearchHit[]> {
    if (hits.length === 0) return []
    if (await isWorkspaceManager(this.db, workspaceId, userId)) return hits

    const taskIds: string[] = []
    const commentIds: string[] = []
    const docIds: string[] = []
    const attachmentIds: string[] = []
    for (const h of hits) {
      const { type, rawId } = splitSearchId(h.id)
      if (type === 'task') taskIds.push(rawId)
      else if (type === 'comment') commentIds.push(rawId)
      else if (type === 'doc') docIds.push(rawId)
      else if (type === 'attachment') attachmentIds.push(rawId)
    }

    // Predicates matching common/permissions/container-access: a private space
    // needs space membership; an explicitly-private project needs project
    // membership. (Conservative — never surfaces content the caller can't see.)
    const memberSpaces = this.db
      .select({ id: spaceMembers.spaceId })
      .from(spaceMembers)
      .where(eq(spaceMembers.userId, userId))
    const memberProjects = this.db
      .select({ id: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId))
    const spaceOk = or(ne(spaces.visibility, 'private'), inArray(spaces.id, memberSpaces))
    const projectOk = or(isNull(projects.visibility), ne(projects.visibility, 'private'), inArray(projects.id, memberProjects))

    const [okTasks, okComments, okDocs, okAttachments] = await Promise.all([
      taskIds.length
        ? this.db
            .select({ id: tasks.id })
            .from(tasks)
            .innerJoin(lists, eq(lists.id, tasks.listId))
            .innerJoin(projects, eq(projects.id, lists.projectId))
            .innerJoin(spaces, eq(spaces.id, projects.spaceId))
            // Per-item task privacy (§2): on top of container access, drop a task
            // hit for a private task the caller didn't create / isn't assigned to.
            // We are past the manager early-return above, so isManager is false.
            .where(
              and(
                eq(spaces.workspaceId, workspaceId),
                inArray(tasks.id, taskIds),
                spaceOk,
                projectOk,
                taskVisibilityFilter(this.db, userId, false),
              ),
            )
        : Promise.resolve([] as Array<{ id: string }>),
      commentIds.length
        ? this.db
            .select({ id: taskComments.id })
            .from(taskComments)
            .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
            .innerJoin(lists, eq(lists.id, tasks.listId))
            .innerJoin(projects, eq(projects.id, lists.projectId))
            .innerJoin(spaces, eq(spaces.id, projects.spaceId))
            .where(and(eq(spaces.workspaceId, workspaceId), inArray(taskComments.id, commentIds), spaceOk, projectOk))
        : Promise.resolve([] as Array<{ id: string }>),
      docIds.length
        ? this.db
            .select({ id: docs.id })
            .from(docs)
            .leftJoin(spaces, eq(spaces.id, docs.spaceId))
            .where(
              and(
                eq(docs.workspaceId, workspaceId),
                inArray(docs.id, docIds),
                or(isNull(docs.spaceId), ne(spaces.visibility, 'private'), inArray(spaces.id, memberSpaces)),
              ),
            )
        : Promise.resolve([] as Array<{ id: string }>),
      // An attachment inherits its parent task's container access: gate it by
      // the SAME space/project visibility as the task it hangs off (join
      // attachment → task → list → project → space). Without this branch an
      // attachment hit would fall through to the `return true` default below and
      // leak content from a private space/project the caller can't reach.
      attachmentIds.length
        ? this.db
            .select({ id: taskAttachments.id })
            .from(taskAttachments)
            .innerJoin(tasks, eq(tasks.id, taskAttachments.taskId))
            .innerJoin(lists, eq(lists.id, tasks.listId))
            .innerJoin(projects, eq(projects.id, lists.projectId))
            .innerJoin(spaces, eq(spaces.id, projects.spaceId))
            .where(and(eq(spaces.workspaceId, workspaceId), inArray(taskAttachments.id, attachmentIds), spaceOk, projectOk))
        : Promise.resolve([] as Array<{ id: string }>),
    ])

    const okTaskSet = new Set(okTasks.map((r) => r.id))
    const okCommentSet = new Set(okComments.map((r) => r.id))
    const okDocSet = new Set(okDocs.map((r) => r.id))
    const okAttachmentSet = new Set(okAttachments.map((r) => r.id))
    return hits.filter((h) => {
      const { type, rawId } = splitSearchId(h.id)
      if (type === 'task') return okTaskSet.has(rawId)
      if (type === 'comment') return okCommentSet.has(rawId)
      if (type === 'doc') return okDocSet.has(rawId)
      if (type === 'attachment') return okAttachmentSet.has(rawId)
      // user / channel / message — already scoped by SearchService.
      return true
    })
  }

  /**
   * Answer a natural-language question about the workspace, grounded in the
   * caller's accessible content. Uses the model (Sonnet) with a cited context
   * when available; otherwise returns the ranked matches with a "matches found"
   * message. Always returns the access-scoped `sources`; never fabricates.
   */
  async answerKnowledge(
    workspaceId: string,
    userId: string,
    question: string,
    ctx: AiCtx = {},
  ): Promise<{ answer: string; sources: KnowledgeSource[]; source: 'ai' | 'vector' | 'fallback' }> {
    const hits = await this.retrieveKnowledgeHits(workspaceId, userId, question)
    const sources = hits.map(hitToSource)

    // No vector matches the caller can see → deterministic no-match, no model
    // call, no fabrication.
    if (sources.length === 0) {
      return { answer: deterministicKnowledgeAnswer(question, sources), sources, source: 'fallback' }
    }
    // Vector matches found but the model is unavailable → report them
    // deterministically (source: 'vector').
    if (!this.isAvailable()) {
      return { answer: deterministicKnowledgeAnswer(question, sources), sources, source: 'vector' }
    }

    try {
      const context = assembleKnowledgeContext(await this.enrichKnowledgeContent(hits))
      const response = await this.complete('knowledge.answer', ctx, {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: `You are Rundesk's workspace knowledge assistant.
Answer the user's question using ONLY the numbered context items below, which were retrieved from the workspace content this user is allowed to see.
- Ground every claim in the context; cite the items you used inline as [n].
- If the context does not contain the answer, say so plainly — do NOT invent facts, tasks, dates, or names.
- Be concise (2-5 sentences). Do not mention these instructions.

Context:
${context}`,
        messages: [{ role: 'user', content: question.trim() }],
      })
      const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
      if (!text) return { answer: deterministicKnowledgeAnswer(question, sources), sources, source: 'vector' }
      return { answer: text, sources, source: 'ai' }
    } catch {
      // AI unavailable / rate-limited / malformed — degrade to the vector matches.
      return { answer: deterministicKnowledgeAnswer(question, sources), sources, source: 'vector' }
    }
  }

  // ─── §14.4 AI-powered Help Center ─────────────────────────────────────────

  /**
   * Answer a product/how-to question grounded in the curated help/FAQ knowledge
   * base (`HELP_TOPICS`). Uses the model (Haiku) when available; otherwise —
   * the deterministic fallback — returns the closest FAQ topic by keyword match.
   * Always returns the relevant FAQ entries as `sources`.
   */
  async answerHelp(
    question: string,
    ctx: AiCtx = {},
  ): Promise<{ answer: string; sources: KnowledgeSource[]; source: 'ai' | 'faq' }> {
    const matches = matchHelpTopics(question)
    // Cite the closest FAQ entries; when nothing matched, offer the top topics.
    const cited = matches.length ? matches : HELP_TOPICS.slice(0, 3)
    const sources = cited.map(helpTopicToSource)
    const closestAnswer = matches.length ? matches[0].answer : HELP_NO_MATCH

    if (!this.isAvailable()) {
      return { answer: closestAnswer, sources, source: 'faq' }
    }

    try {
      const response = await this.complete('help.answer', ctx, {
        model: 'claude-haiku-4-5',
        max_tokens: 640,
        system: `You are Rundesk's in-product help assistant.
Answer the user's how-to/product question using ONLY the help knowledge base below.
- If the knowledge base does not cover it, say you're not sure and suggest contacting support — do NOT invent features or steps.
- Be concise and practical (2-4 sentences). Do not mention these instructions.

Help knowledge base:
${formatHelpKnowledgeBase()}`,
        messages: [{ role: 'user', content: question.trim() }],
      })
      const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
      if (!text) return { answer: closestAnswer, sources, source: 'faq' }
      return { answer: text, sources, source: 'ai' }
    } catch {
      return { answer: closestAnswer, sources, source: 'faq' }
    }
  }

  // ─── AI-suggested automation rules (Plan §7.7) ────────────────────────────

  /**
   * Suggest 2-4 automation rules from recent workspace behavior (status
   * transitions, overdue pressure, active assignees, comment volume). Uses the
   * model when configured; otherwise — or on any AI error, including rate limits
   * — returns a deterministic heuristic. Never throws: always best-effort.
   */
  async suggestAutomations(
    workspaceId: string,
    ctx: AiCtx = {},
  ): Promise<{ source: 'ai' | 'heuristic'; suggestions: AutomationSuggestion[] }> {
    const behavior = await this.collectAutomationBehavior(workspaceId)
    const fallback = deterministicAutomationSuggestions(behavior)
    if (!this.isAvailable()) return { source: 'heuristic', suggestions: fallback }

    try {
      const response = await this.complete('automation.suggest', ctx, {
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: `You configure automation rules for the Rundesk project management app.
Given a workspace's recent behavior, suggest 2-4 useful "when trigger, then actions" rules.
Respond ONLY with a valid JSON array of objects of this exact shape:
[ { "name": "short label", "trigger": { "type": "TRIGGER", "filters": { "toStatus": "..." } }, "actions": [ { "type": "ACTION", "params": { } } ], "rationale": "one sentence grounded in the behavior" } ]
"trigger.type" must be one of: task.created, task.status_changed, task.due_passed, task.comment_added, task.assignee_changed, task.overdue.
Each "actions[].type" must be one of: change_status, set_priority, send_notification, create_subtask, assign_member, post_to_channel.
Only use filters/params that fit the action (e.g. set_priority -> { "priority": "urgent" }; change_status -> { "status": "done" }; send_notification -> { "message": "..." }). Do not invent channel ids.`,
        messages: [{ role: 'user', content: `Recent workspace behavior:\n${formatAutomationBehavior(behavior)}` }],
      })
      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const match = text.match(/\[[\s\S]*\]/)
      const parsed = match ? sanitizeAutomationSuggestions(safeJsonParse(match[0])) : []
      return parsed.length ? { source: 'ai', suggestions: parsed.slice(0, 4) } : { source: 'heuristic', suggestions: fallback }
    } catch {
      // AI unavailable / rate-limited / malformed — degrade to the heuristic.
      return { source: 'heuristic', suggestions: fallback }
    }
  }

  /** Read recent workspace behavior stats used to ground automation suggestions. */
  private async collectAutomationBehavior(workspaceId: string): Promise<AutomationBehavior> {
    const since = new Date(Date.now() - 30 * 24 * 3_600_000)
    const now = new Date()
    const [transitions, overdue, assignees, comments, openTasks] = await Promise.all([
      this.db
        .select({
          from: sql<string>`coalesce(${taskActivity.meta}->>'from','')`,
          to: sql<string>`coalesce(${taskActivity.meta}->>'to','')`,
          count: sql<number>`count(*)::int`,
        })
        .from(taskActivity)
        .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(taskActivity.action, 'status_changed'), gte(taskActivity.createdAt, since)))
        .groupBy(sql`${taskActivity.meta}->>'from'`, sql`${taskActivity.meta}->>'to'`)
        .orderBy(desc(sql`count(*)`))
        .limit(6),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false), lte(tasks.dueDate, now), sql`${tasks.statusCategory} <> 'closed'`)),
      this.db
        .select({ name: sql<string>`coalesce(${users.displayName}, ${users.email})`, count: sql<number>`count(*)::int` })
        .from(taskAssignees)
        .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .innerJoin(users, eq(users.id, taskAssignees.userId))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false), sql`${tasks.statusCategory} <> 'closed'`))
        .groupBy(users.id, users.displayName, users.email)
        .orderBy(desc(sql`count(*)`))
        .limit(5),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(taskActivity)
        .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(taskActivity.action, 'commented'), gte(taskActivity.createdAt, since))),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false), sql`${tasks.statusCategory} <> 'closed'`)),
    ])

    return {
      totalOpenTasks: openTasks[0]?.count ?? 0,
      overdueCount: overdue[0]?.count ?? 0,
      statusTransitions: transitions
        .filter((t) => t.to)
        .map((t) => ({ from: t.from || '(none)', to: t.to, count: t.count })),
      topAssignees: assignees.map((a) => ({ name: a.name || 'Someone', count: a.count })),
      commentActivityCount: comments[0]?.count ?? 0,
    }
  }

  isAvailable(): boolean {
    return this.client !== null
  }

  // ─── Agentic AI commands (Plan §7.6 / §7.8) ───────────────────────────────

  /** Membership role for (workspace, user), or null when not a member. */
  private async memberRole(workspaceId: string, userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    return row?.role ?? null
  }

  private async resolveListWorkspaceId(listId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    return row?.workspaceId ?? null
  }

  private async resolveTaskWorkspaceId(taskId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    return row?.workspaceId ?? null
  }

  /**
   * Assert the user may read a task's workspace (Plan §7.5 hardening). Reused by
   * the `/ai/summarize` taskId path so any authed user can no longer summarize an
   * arbitrary task by id.
   */
  async assertTaskWorkspaceAccess(taskId: string, userId: string): Promise<void> {
    const workspaceId = await this.resolveTaskWorkspaceId(taskId)
    if (!workspaceId) throw new NotFoundException('Task not found')
    const role = await this.memberRole(workspaceId, userId)
    if (!role) throw new ForbiddenException('You do not have access to this task')
  }

  /**
   * Load the bounded, DB-resolved context the command planner needs: destination
   * lists (with paths), workspace members (for assigneeEmail→userId), and the
   * open tasks (with assignee emails) that search / bulk filters run against.
   */
  async loadCommandContext(
    workspaceId: string,
    actorId: string,
    actorRole?: string | null,
  ): Promise<CommandContext> {
    // Per-item privacy (§2): a non-manager caller must not see private tasks/lists
    // they don't own (or, for tasks, aren't assigned to). Managers are unrestricted.
    const isManager = actorId ? await resolveIsManager(this.db, workspaceId, actorId, actorRole) : false
    const today = new Date().toISOString().slice(0, 10)
    const [listRows, memberRows, taskRows] = await Promise.all([
      this.db
        .select({ id: lists.id, name: lists.name, projectName: projects.name, spaceName: spaces.name })
        .from(lists)
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(lists.isArchived, false), listVisibilityFilter(actorId, isManager)))
        .orderBy(asc(spaces.name), asc(projects.name), asc(lists.name))
        .limit(100),
      this.db
        .select({ userId: users.id, email: users.email, displayName: users.displayName })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(eq(workspaceMembers.workspaceId, workspaceId)),
      this.db
        .select({
          id: tasks.id,
          title: tasks.title,
          listId: tasks.listId,
          status: tasks.status,
          statusCategory: tasks.statusCategory,
          dueDate: tasks.dueDate,
        })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false), taskVisibilityFilter(this.db, actorId, isManager)))
        .orderBy(asc(tasks.dueDate))
        .limit(300),
    ])

    const taskIds = taskRows.map((t) => t.id)
    const assigneeRows = taskIds.length
      ? await this.db
          .select({ taskId: taskAssignees.taskId, email: users.email })
          .from(taskAssignees)
          .innerJoin(users, eq(users.id, taskAssignees.userId))
          .where(inArray(taskAssignees.taskId, taskIds))
      : []
    const emailsByTask = new Map<string, string[]>()
    for (const row of assigneeRows) {
      const list = emailsByTask.get(row.taskId) ?? []
      list.push(row.email)
      emailsByTask.set(row.taskId, list)
    }

    return {
      today,
      lists: listRows.map((l) => ({ id: l.id, name: l.name, path: `${l.spaceName} / ${l.projectName} / ${l.name}` })),
      members: memberRows.map((m) => ({ userId: m.userId, email: m.email, displayName: m.displayName })),
      tasks: taskRows.map((t) => ({
        id: t.id,
        title: t.title,
        listId: t.listId,
        status: t.status,
        statusCategory: t.statusCategory as StatusCategory,
        dueDate: toDayString(t.dueDate) || null,
        assigneeEmails: emailsByTask.get(t.id) ?? [],
      })),
    }
  }

  /**
   * Run a natural-language command through Anthropic **tool use** and return a
   * preview→confirm PLAN. READ-ONLY `search_tasks` calls run immediately against
   * the context to inform the plan; every MUTATING tool call is validated,
   * resolved, and returned as an action to confirm — nothing mutates here.
   * All model calls route through `complete` (rate limit + usage tracking).
   */
  /**
   * §15 — draft a whole skill from a sentence, `[18:17]–[18:42]`.
   *
   *   "main is ko sab cheezein batati jaoongi… Pehle to woh apna [data sketch]
   *    out karega jo main kaam kar rahi hoon… phir woh meri poori ki poori
   *    SKILL create karega."
   *
   * Same shape as `command` above and for the same reason: this PROPOSES and
   * writes nothing. Frame `t1146` ends on "Approve this approach and I'll
   * create it" — the gate is the feature, not a safety bolt-on, and it is also
   * the only reason a skill drafted from your real data is safe to draft at all.
   *
   * The steps it reports are lookups it actually performed. A "thinking"
   * animation listing work that did not happen would be theatre, and worse, it
   * would imply grounding behind a proposal that has none.
   */
  async proposeSkill(
    workspaceId: string,
    userId: string,
    request: string,
    ctx: AiCtx = {},
    /**
     * Called as each lookup finishes, so the caller can show the work.
     *
     * A step is emitted only once its lookup has actually returned. The
     * alternative — a client animating a hardcoded list of labels — would look
     * identical on a good day and lie on a bad one, and it is precisely on the
     * bad day that someone needs to know what was and was not read.
     */
    onStep?: (step: ProposalStep) => void,
  ): Promise<{ proposal: SkillProposal; message: string }> {
    const steps: ProposalStep[] = []
    const step = (s: ProposalStep) => {
      steps.push(s)
      onStep?.(s)
    }

    const [workspaceContext, personal, existing] = await Promise.all([
      this.buildWorkspaceContext(workspaceId, userId),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(personalTasks)
        .where(and(eq(personalTasks.workspaceId, workspaceId), eq(personalTasks.userId, userId))),
      this.db
        .select({ name: skills.name })
        .from(skills)
        .where(and(eq(skills.workspaceId, workspaceId), eq(skills.createdById, userId)))
        .limit(20),
    ])

    step({
      label: "Checking what you're working on",
      finding: workspaceContext.split('\n').find((l) => l.startsWith('Workspace:')) ?? undefined,
    })
    const personalCount = personal[0]?.n ?? 0
    step({
      label: 'Mapping your task habits',
      // The number, not an adjective: "mostly empty" is the model's call to make
      // from a real count, not ours to assert on its behalf.
      finding: `${personalCount} item(s) on your personal list`,
    })
    const owned = existing.map((r) => r.name)
    step({
      label: 'Checking the skills you already have',
      finding: owned.length ? owned.join(', ') : 'none yet',
    })

    if (!this.isAvailable()) {
      const proposal = fallbackProposal(request, steps)
      return { proposal, message: renderProposal(proposal) }
    }

    const response = await this.complete('skill.propose', ctx, {
      model: 'claude-sonnet-4-6',
      max_tokens: 1600,
      system: `You draft a reusable SKILL for the Rundesk project management app.

A skill is a named playbook — a persona plus instructions — that shapes how the
assistant answers when someone invokes it. It does NOT act on its own, so never
write instructions that assume it can take actions unattended.

Ground the draft in the real details below rather than generic advice, and say
what you grounded it on in one sentence. Prefer the smallest skill that does the
job: if their workspace shows little activity, propose something simple and say
why, rather than an elaborate system nobody asked for.

Reply with ONLY a JSON object:
{
  "name": "Title Case, like a product a person would spot in a list — 'Personal Task Organizer', 'Brand Voice', 'Triage Tasks Like Me'. Never a lowercase echo of their request.",
  "description": "one line",
  "instructions": "the playbook, second person, addressed to the assistant",
  "memories": ["facts about how this person works, worth keeping"],
  "rationale": "one or two sentences on what you saw and why this shape",
  "followUps": ["three things THE USER would say next, in their voice, as instructions to you — 'Create the skill with daily and weekly review modes', 'Turn my messy notes into clear next actions'. Each is sent verbatim as their next message when clicked, so NEVER write a question addressed to them."]
}`,
      messages: [
        {
          role: 'user',
          content: `Request: ${request}

${workspaceContext}

Personal list: ${personalCount} item(s).
Skills they already have: ${owned.length ? owned.join(', ') : 'none'}.`,
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    // A draft that cannot be parsed falls back to one built from the request —
    // never to a half-populated skill, which would look authored and be empty.
    const proposal = parseSkillProposal(text, steps) ?? fallbackProposal(request, steps)
    return { proposal, message: renderProposal(proposal) }
  }

  async command(workspaceId: string, message: string, ctx: AiCtx = {}): Promise<CommandPlan> {
    const [workspaceContext, planCtx] = await Promise.all([
      this.buildWorkspaceContext(workspaceId, ctx.userId ?? ''),
      this.loadCommandContext(workspaceId, ctx.userId ?? ''),
    ])

    const listCatalog = planCtx.lists
      .slice(0, 60)
      .map((l) => `- ${l.id}: ${l.path}`)
      .join('\n')
    const systemPrompt = `You are Rundesk's command assistant. Translate the user's natural-language request into tool calls.
Today's date is ${planCtx.today}.
Use search_tasks (READ-ONLY) to locate task ids before proposing changes; reference tasks by their id.
For any change (create_task / set_task_status / reschedule_task / assign_task / bulk_reschedule) call the matching tool. Changes are PREVIEWED for the user to confirm and are NOT executed until they confirm — do not claim you have already made a change.
When creating a task, pick a listId from "Available lists". Resolve people by their email.

Workspace context:
${workspaceContext}

Available lists (id: path):
${listCatalog || '(none)'}`

    const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: message }]
    const collected: ToolCall[] = []

    // Bounded agentic loop: keep going while the model only searches (so it can
    // act on the results), and stop as soon as it proposes any mutation.
    for (let turn = 0; turn < 5; turn++) {
      const response = await this.complete('command', ctx, {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        tools: COMMAND_TOOLS,
        messages,
      })

      const toolUses = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
      )
      if (toolUses.length === 0) break

      messages.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
      let hasMutation = false
      for (const toolUse of toolUses) {
        const input = (toolUse.input ?? {}) as Record<string, unknown>
        collected.push({ name: toolUse.name, input })
        if (toolUse.name === 'search_tasks') {
          const found = searchTasksInContext(input, planCtx)
            .slice(0, 25)
            .map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, assigneeEmails: t.assigneeEmails }))
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(found) })
        } else {
          hasMutation = true
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: 'Queued for the user to confirm (not executed).',
          })
        }
      }
      messages.push({ role: 'user', content: toolResults })
      if (hasMutation) break
    }

    // Deterministic plan (Plan §7.6): honest summary + resolved actions built
    // purely from the collected tool calls, so the preview never over-claims.
    return planFromToolCalls(collected, planCtx)
  }

  /**
   * Execute confirmed actions via TasksService (Plan §7.6). Each mutation is
   * access-checked (TasksService enforces task write permission; create_task
   * verifies non-guest workspace membership) — actions the caller can't perform
   * are skipped and reported rather than failing the batch. TasksService already
   * audits each mutation via its activity log.
   */
  async executeActions(actions: PlanAction[], userId: string): Promise<CommandExecuteResult> {
    const results: CommandActionResult[] = []
    for (const action of actions) {
      try {
        results.push(await this.executeOne(action, userId))
      } catch (err) {
        const skippable =
          err instanceof ForbiddenException || err instanceof NotFoundException || err instanceof BadRequestException
        const reason = err instanceof ForbiddenException ? 'no_permission' : err instanceof Error ? err.message : 'error'
        results.push({
          tool: action.tool,
          humanLabel: action.humanLabel,
          status: skippable ? 'skipped' : 'failed',
          reason,
          affectedTaskIds: action.affectedTaskIds,
        })
      }
    }
    return { results }
  }

  private async executeOne(action: PlanAction, userId: string): Promise<CommandActionResult> {
    switch (action.tool) {
      case 'create_task': {
        const workspaceId = await this.resolveListWorkspaceId(action.args.listId)
        if (!workspaceId) {
          return { tool: action.tool, humanLabel: action.humanLabel, status: 'skipped', reason: 'List not found' }
        }
        const role = await this.memberRole(workspaceId, userId)
        if (!role || role === 'guest') {
          return { tool: action.tool, humanLabel: action.humanLabel, status: 'skipped', reason: 'no_permission' }
        }
        // Only assign a resolved assignee that is actually a member of this workspace.
        let assigneeIds: string[] | undefined
        if (action.args.assigneeId && (await this.memberRole(workspaceId, action.args.assigneeId))) {
          assigneeIds = [action.args.assigneeId]
        }
        const created = await this.tasks.createTask({
          listId: action.args.listId,
          title: action.args.title,
          description: action.args.description,
          priority: action.args.priority,
          dueDate: action.args.dueDate ? new Date(action.args.dueDate) : undefined,
          assigneeIds,
          createdById: userId,
        })
        return {
          tool: action.tool,
          humanLabel: action.humanLabel,
          status: 'succeeded',
          affectedTaskIds: created ? [created.id] : [],
        }
      }
      case 'set_task_status': {
        await this.tasks.updateTask(action.args.taskId, userId, { status: action.args.status })
        return { tool: action.tool, humanLabel: action.humanLabel, status: 'succeeded', affectedTaskIds: action.affectedTaskIds }
      }
      case 'reschedule_task': {
        await this.tasks.updateTask(action.args.taskId, userId, { dueDate: new Date(action.args.dueDate) })
        return { tool: action.tool, humanLabel: action.humanLabel, status: 'succeeded', affectedTaskIds: action.affectedTaskIds }
      }
      case 'assign_task': {
        // Guard against a tampered assigneeId: only assign an actual member.
        const workspaceId = await this.resolveTaskWorkspaceId(action.args.taskId)
        if (workspaceId && !(await this.memberRole(workspaceId, action.args.assigneeId))) {
          return { tool: action.tool, humanLabel: action.humanLabel, status: 'skipped', reason: 'Assignee is not a workspace member' }
        }
        await this.tasks.addAssignee(action.args.taskId, action.args.assigneeId, userId)
        return { tool: action.tool, humanLabel: action.humanLabel, status: 'succeeded', affectedTaskIds: action.affectedTaskIds }
      }
      case 'bulk_reschedule': {
        const res = await this.tasks.bulkUpdateTasks(action.args.taskIds, userId, { dueDate: new Date(action.args.dueDate) })
        const status: CommandActionResult['status'] = res.updatedCount > 0 ? 'succeeded' : 'skipped'
        const reason =
          res.failedCount > 0
            ? res.updatedCount > 0
              ? `${res.updatedCount} updated, ${res.failedCount} skipped`
              : 'no_permission'
            : undefined
        return { tool: action.tool, humanLabel: action.humanLabel, status, reason, affectedTaskIds: action.args.taskIds }
      }
    }
  }

  // ─── Workspace insights (real AI over real metrics) ───────────────────────
  async generateInsights(context: string, ctx: AiCtx = {}): Promise<{
    summary: string
    health: { score: number; label: string; reasoning: string }
    suggestions: Array<{ title: string; detail: string; cta?: string; target?: string }>
  }> {
    const response = await this.complete('insights', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: `You are an analytics assistant for the Rundesk project management app.
Given a workspace's real metrics, produce concise, actionable insights.
Respond ONLY with valid JSON of this exact shape:
{
  "summary": "2-3 sentence plain-text overview of how the workspace is doing",
  "health": { "score": 0-100 integer, "label": "thriving|steady|at_risk", "reasoning": "one sentence" },
  "suggestions": [ { "title": "short", "detail": "one sentence", "cta": "button label", "target": "overdue|sprint|workload|reports" } ]
}
Give 3-4 suggestions. "target" must be one of: overdue, sprint, workload, reports.`,
      messages: [{ role: 'user', content: `Workspace metrics:\n${context}` }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) {
      return { summary: 'Insights are unavailable right now.', health: { score: 0, label: 'steady', reasoning: '' }, suggestions: [] }
    }
    return JSON.parse(jsonMatch[0])
  }

  // ─── Dashboard layout suggestion (real AI) ────────────────────────────────
  async suggestDashboardLayout(
    availableWidgets: Array<{ type: string; label: string }>,
    context: string,
    ctx: AiCtx = {},
  ): Promise<{ widgets: string[]; reasoning: string }> {
    const response = await this.complete('dashboard.layout', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: `You arrange a project dashboard. Choose and order the most useful widgets for this workspace from the available list.
Respond ONLY with valid JSON: { "widgets": ["type", ...], "reasoning": "one sentence" }.
"widgets" must be a subset of the provided widget types, ordered most-important first (4-6 items).`,
      messages: [
        {
          role: 'user',
          content: `Available widgets:\n${availableWidgets.map((w) => `- ${w.type}: ${w.label}`).join('\n')}\n\nWorkspace context:\n${context}`,
        },
      ],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) return { widgets: availableWidgets.map((w) => w.type).slice(0, 5), reasoning: '' }
    const parsed = JSON.parse(jsonMatch[0]) as { widgets?: unknown; reasoning?: unknown }
    const valid = new Set(availableWidgets.map((w) => w.type))
    const widgets = Array.isArray(parsed.widgets) ? (parsed.widgets as unknown[]).filter((w): w is string => typeof w === 'string' && valid.has(w)) : []
    return { widgets: widgets.length ? widgets : availableWidgets.map((w) => w.type).slice(0, 5), reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '' }
  }

  // ─── Comment sentiment for project health (Plan §7.13) ────────────────────

  /**
   * Gauge team sentiment from a project's recent task comments (Plan §7.13).
   * Uses the model (haiku) when configured; otherwise — or on any AI error /
   * malformed output — falls back to the deterministic keyword classifier.
   * Never throws so the daily health cron can always fold in a sentiment score.
   */
  async analyzeCommentSentiment(texts: string[], ctx: AiCtx = {}): Promise<SentimentResult> {
    const fallback = analyzeSentimentDeterministic(texts)
    if (fallback.samples === 0 || !this.isAvailable()) return fallback
    try {
      const sample = texts
        .filter((t) => (t ?? '').trim())
        .slice(0, 40)
        .map((t, i) => `${i + 1}. ${truncate(t, 200)}`)
        .join('\n')
      const response = await this.complete('project.sentiment', ctx, {
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        system: `You gauge team sentiment from task comments for a project-health score.
Respond ONLY with valid JSON: { "score": 0-100 integer (0 very negative, 50 neutral, 100 very positive), "label": "positive|neutral|negative" }.`,
        messages: [{ role: 'user', content: `Recent comments:\n${sample}` }],
      })
      const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
      const parsed = safeJsonParse((text.match(/\{[\s\S]*\}/) ?? [''])[0]) as { score?: unknown } | undefined
      const score =
        parsed && Number.isFinite(Number(parsed.score)) ? Math.max(0, Math.min(100, Math.round(Number(parsed.score)))) : null
      if (score === null) return fallback
      const label: SentimentLabel = score >= 60 ? 'positive' : score <= 40 ? 'negative' : 'neutral'
      return { score, label, positive: fallback.positive, negative: fallback.negative, samples: fallback.samples, source: 'ai' }
    } catch {
      return fallback
    }
  }

  // ─── Daily briefing generation (Plan §7.11) ───────────────────────────────

  /**
   * Generate a short daily briefing (Plan §7.11). Uses the model (haiku) when
   * configured; otherwise — or on any AI error — returns the deterministic
   * template. Never throws: always best-effort so the cron can always deliver.
   */
  async generateBriefing(data: BriefingData, ctx: AiCtx = {}): Promise<string> {
    const fallback = formatBriefingFallback(data)
    if (!this.isAvailable()) return fallback
    try {
      const lines = [
        `Name: ${data.displayName || 'teammate'}`,
        `Overdue (${data.overdue.length}): ${data.overdue.slice(0, 8).join('; ') || 'none'}`,
        `Blocking others (${data.blocking.length}): ${data.blocking.slice(0, 8).join('; ') || 'none'}`,
        `Due today (${data.dueToday.length}): ${data.dueToday.slice(0, 8).join('; ') || 'none'}`,
        `At risk soon (${data.atRisk.length}): ${data.atRisk.slice(0, 8).join('; ') || 'none'}`,
      ].join('\n')
      const response = await this.complete('daily.briefing', ctx, {
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        system: `You are Rundesk's daily briefing assistant. Write a warm, concise morning briefing (2-4 sentences, plain text) that leads with what is most urgent (overdue, then tasks blocking others, then due-today, then at-risk). Address the person by their first name. Do not invent tasks beyond those provided.`,
        messages: [{ role: 'user', content: `Here is my work for today:\n${lines}` }],
      })
      const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
      return text || fallback
    } catch {
      return fallback
    }
  }

  // ─── Smart task suggestions (Plan §7.10) ──────────────────────────────────

  /** Ensure the caller is a manager/admin of the workspace (mutating AI actions). */
  async assertWorkspaceManager(workspaceId: string, userId: string): Promise<void> {
    const role = await this.memberRole(workspaceId, userId)
    if (!role || !['workspace_admin', 'manager', 'super_admin'].includes(role)) {
      throw new ForbiddenException('Only managers or admins can perform this action')
    }
  }

  /**
   * Suggest a task list for a project by learning from SIMILAR existing projects
   * in the workspace (Plan §7.10): rank candidates by name/keyword similarity,
   * summarize their task titles, and return the most-frequent titles as a
   * deterministic fallback; refine with the model (haiku) when configured. Never
   * throws — always best-effort so the UI can always render something.
   */
  async suggestTasks(
    input: { workspaceId: string; projectId?: string; projectName?: string; description?: string },
    ctx: AiCtx = {},
  ): Promise<{ source: 'ai' | 'heuristic'; suggestions: TaskSuggestion[]; basis: string }> {
    const target =
      (input.projectName ?? '').trim() || (await this.resolveProjectName(input.projectId)) || 'this project'
    const candidates = await this.collectCandidateProjects(input.workspaceId, input.projectId)
    const similar = rankSimilarProjects(target, candidates)
    const basis = summarizeSuggestionBasis(similar)
    const fallback = deterministicTaskSuggestions(similar)

    if (!this.isAvailable()) return { source: 'heuristic', suggestions: fallback, basis }
    try {
      const similarBlock = similar
        .filter((p) => p.taskTitles.length)
        .slice(0, 5)
        .map((p) => `Project "${p.name}":\n${p.taskTitles.slice(0, 15).map((t) => `- ${t}`).join('\n')}`)
        .join('\n\n')
      const response = await this.complete('task.suggest', ctx, {
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        system: `You plan a new project's initial task list for the Rundesk project management app.
Learn from how SIMILAR existing projects in this workspace were broken down.
Respond ONLY with a valid JSON array of 5-10 objects: [{ "title": "concise action-oriented task", "priority": "urgent|high|normal|low" }].
Prefer titles/patterns seen in the similar projects and adapt them to the new project. Do not number the titles.`,
        messages: [
          {
            role: 'user',
            content: `New project: "${target}"${input.description ? `\nDescription: ${input.description}` : ''}\n\nSimilar projects and their tasks:\n${similarBlock || '(no similar projects with tasks)'}`,
          },
        ],
      })
      const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
      const match = text.match(/\[[\s\S]*\]/)
      const parsed = match ? sanitizeTaskSuggestions(safeJsonParse(match[0])) : []
      return parsed.length
        ? { source: 'ai', suggestions: parsed, basis }
        : { source: 'heuristic', suggestions: fallback, basis }
    } catch {
      return { source: 'heuristic', suggestions: fallback, basis }
    }
  }

  private async resolveProjectName(projectId?: string): Promise<string | null> {
    if (!projectId) return null
    const [row] = await this.db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1)
    return row?.name ?? null
  }

  /** Workspace projects (excluding the target) with their bounded top-level task titles. */
  private async collectCandidateProjects(
    workspaceId: string,
    excludeProjectId?: string,
  ): Promise<Array<{ id: string; name: string; taskTitles: string[] }>> {
    const projectRows = await this.db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(spaces.workspaceId, workspaceId))
      .orderBy(desc(projects.createdAt))
      .limit(60)
    const ids = projectRows.map((p) => p.id).filter((id) => id !== excludeProjectId)
    if (ids.length === 0) return []
    const taskRows = await this.db
      .select({ projectId: lists.projectId, title: tasks.title })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .where(and(inArray(lists.projectId, ids), eq(tasks.isArchived, false), isNull(tasks.parentTaskId)))
      .limit(3000)
    const byProject = new Map<string, string[]>()
    for (const r of taskRows) {
      const list = byProject.get(r.projectId) ?? []
      if (list.length < 40) list.push(r.title)
      byProject.set(r.projectId, list)
    }
    return projectRows
      .filter((p) => p.id !== excludeProjectId)
      .map((p) => ({ id: p.id, name: p.name, taskTitles: byProject.get(p.id) ?? [] }))
  }

  // ─── Smart workload balancing (Plan §7.12) ────────────────────────────────

  /**
   * Per-member open-task load (non-archived, non-closed) across the workspace,
   * with each member's task ids ordered least-urgent-first so the tasks handed
   * off first are the safest to move. Reuses the workload report's join shape.
   */
  async collectWorkloadLoads(workspaceId: string): Promise<WorkloadLoad[]> {
    const members = await this.db
      .select({
        userId: users.id,
        name: sql<string>`coalesce(${users.displayName}, ${users.email})`,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), ne(workspaceMembers.role, 'guest')))

    const rows = await this.db
      .select({ userId: taskAssignees.userId, taskId: tasks.id, priority: tasks.priority, dueDate: tasks.dueDate })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false), sql`${tasks.statusCategory} <> 'closed'`),
      )

    const prioRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
    const rank = (p: string | null) => prioRank[p ?? 'normal'] ?? 2
    const sorted = rows.slice().sort((a, b) => {
      // Least urgent first, then furthest-out due date first (safest to reassign).
      const byPrio = rank(b.priority) - rank(a.priority)
      if (byPrio !== 0) return byPrio
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY
      return db - da
    })
    const byUser = new Map<string, string[]>()
    for (const r of sorted) {
      const list = byUser.get(r.userId) ?? []
      list.push(r.taskId)
      byUser.set(r.userId, list)
    }
    return members.map((m) => {
      const taskIds = byUser.get(m.userId) ?? []
      return { userId: m.userId, name: m.name || 'Someone', open: taskIds.length, taskIds }
    })
  }

  /**
   * Redistribution suggestions from real per-assignee open-task load (Plan §7.12).
   * Deterministic heuristic always available; refined by the model (haiku) when
   * configured, with task ids resolved server-side from the real loads.
   */
  async workloadBalance(workspaceId: string, ctx: AiCtx = {}): Promise<WorkloadBalanceResult> {
    const loads = await this.collectWorkloadLoads(workspaceId)
    const heuristic = computeWorkloadBalance(loads, { source: 'heuristic' })
    if (!this.isAvailable() || heuristic.suggestions.length === 0) return heuristic
    try {
      const loadLines = loads.map((l) => `${l.name} (id ${l.userId}): ${l.open} open`).join('\n')
      const response = await this.complete('workload.balance', ctx, {
        model: 'claude-haiku-4-5',
        max_tokens: 700,
        system: `You balance team workload for the Rundesk project management app.
Given each teammate's open-task count, propose up to 3 redistribution moves from overloaded to underloaded teammates.
Respond ONLY with a valid JSON array: [{ "fromUserId": "id", "toUserId": "id", "count": integer, "rationale": "one sentence" }].
Only move work FROM people above the team average TO people below it. Never move more tasks than the source has. Use the exact ids provided.`,
        messages: [{ role: 'user', content: `Open-task load per teammate:\n${loadLines}\n\nTeam average: ${heuristic.average}` }],
      })
      const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
      const match = text.match(/\[[\s\S]*\]/)
      const ai = mapAiWorkloadMoves(match ? safeJsonParse(match[0]) : undefined, loads)
      return ai.suggestions.length ? ai : heuristic
    } catch {
      return heuristic
    }
  }

  /**
   * Execute confirmed workload moves (Plan §7.12): reassign each task from
   * `fromUserId` to `toUserId` by reusing TasksService.addAssignee +
   * removeAssignee (each access-checked against the actor). `toUserId` must be a
   * non-guest member of `workspaceId`; tasks the actor can't modify are skipped.
   */
  async executeWorkloadBalance(
    workspaceId: string,
    moves: Array<{ fromUserId: string; toUserId: string; taskIds: string[] }>,
    userId: string,
  ): Promise<{
    reassigned: number
    skipped: number
    moves: Array<{ fromUserId: string; toUserId: string; reassigned: number; skipped: number }>
  }> {
    let reassigned = 0
    let skipped = 0
    const perMove: Array<{ fromUserId: string; toUserId: string; reassigned: number; skipped: number }> = []
    const memberCache = new Map<string, boolean>()
    const isMember = async (uid: string) => {
      if (memberCache.has(uid)) return memberCache.get(uid) as boolean
      const role = await this.memberRole(workspaceId, uid)
      const ok = Boolean(role) && role !== 'guest'
      memberCache.set(uid, ok)
      return ok
    }

    for (const move of moves ?? []) {
      let mReassigned = 0
      let mSkipped = 0
      const taskIds = Array.isArray(move?.taskIds) ? move.taskIds.slice(0, 100) : []
      const targetOk = move?.toUserId && move.toUserId !== move.fromUserId && (await isMember(move.toUserId))
      for (const taskId of taskIds) {
        if (!targetOk) {
          mSkipped++
          continue
        }
        try {
          // Access checks live in TasksService: addAssignee/removeAssignee both
          // assertTaskWriteAccess(taskId, actor), so a caller can only reassign
          // tasks they may edit — and only within this workspace.
          await this.tasks.addAssignee(taskId, move.toUserId, userId)
          await this.tasks.removeAssignee(taskId, move.fromUserId, userId)
          mReassigned++
        } catch {
          mSkipped++
        }
      }
      reassigned += mReassigned
      skipped += mSkipped
      perMove.push({ fromUserId: move.fromUserId, toUserId: move.toUserId, reassigned: mReassigned, skipped: mSkipped })
    }
    return { reassigned, skipped, moves: perMove }
  }

  /** Workspace managers/admins (recipients of proactive workload alerts, Plan §7.12). */
  async workspaceManagers(workspaceId: string): Promise<Array<{ userId: string }>> {
    return this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.role, ['workspace_admin', 'manager', 'super_admin']),
        ),
      )
  }

  /** Workspaces that currently have any open (non-archived, non-closed) assigned tasks. */
  async workspacesWithOpenWork(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ workspaceId: spaces.workspaceId })
      .from(tasks)
      .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(tasks.isArchived, false), sql`${tasks.statusCategory} <> 'closed'`))
    return rows.map((r) => r.workspaceId)
  }

  /** Overloaded-user ids already alerted in this workspace since `cutoff` (dedupe). */
  async recentlyWorkloadAlerted(workspaceId: string, cutoff: Date): Promise<Set<string>> {
    const rows = await this.db
      .select({ entityId: sql<string>`${notifications.target}->>'entityId'` })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, workspaceId),
          eq(notifications.type, 'workload_alert'),
          gte(notifications.createdAt, cutoff),
        ),
      )
    return new Set(rows.map((r) => r.entityId).filter((id): id is string => Boolean(id)))
  }

  // ─── Contribution narratives (Plan §7.14) ─────────────────────────────────

  /**
   * Generate a one-sentence contribution narrative per member from precomputed
   * real metrics (Plan §7.14). One model call (haiku) covers everyone; on any
   * failure or when AI is unavailable each member falls back to its deterministic
   * narrative. Never throws.
   */
  async narrateContributions(
    items: Array<{ key: string; name: string; facts: string; fallback: string }>,
    ctx: AiCtx = {},
  ): Promise<Record<string, string>> {
    const fallbackMap: Record<string, string> = {}
    for (const it of items) fallbackMap[it.key] = it.fallback
    if (items.length === 0 || !this.isAvailable()) return fallbackMap
    try {
      const block = items.map((it, i) => `${i + 1}. ${it.name} — ${it.facts}`).join('\n')
      const response = await this.complete('contribution.narrative', ctx, {
        model: 'claude-haiku-4-5',
        max_tokens: 900,
        system: `You write one-sentence contribution summaries for team members based on their real metrics for a reporting period.
Respond ONLY with a valid JSON object mapping each member's number to a warm, specific one-sentence summary, e.g. { "1": "...", "2": "..." }. Do not invent metrics beyond those given.`,
        messages: [{ role: 'user', content: `Members and metrics:\n${block}` }],
      })
      const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
      const parsed = safeJsonParse((text.match(/\{[\s\S]*\}/) ?? [''])[0]) as Record<string, unknown> | undefined
      if (!parsed || typeof parsed !== 'object') return fallbackMap
      const out: Record<string, string> = {}
      items.forEach((it, i) => {
        const v = parsed[String(i + 1)]
        out[it.key] = typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : it.fallback
      })
      return out
    } catch {
      return fallbackMap
    }
  }
}
