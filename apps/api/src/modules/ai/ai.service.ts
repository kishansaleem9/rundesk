import { WS_MANAGER_ROLES, isManagerRole } from '../../common/permissions/workspace-roles'
import {
  Injectable,
  Inject,
  Optional,
  HttpException,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import type { Response } from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { aiAnswerFeedback, aiModelPreferences, aiUsage, meetings, workspaces, workspaceMembers, spaces, spaceMembers, projects, projectMembers, lists, listStatuses, tasks, taskComments, taskAttachments, taskAssignees, taskActivity, docs, users, notifications, knowledgeEmbeddings, personalTasks, skills } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { FOLLOW_UP_INSTRUCTION, createFollowUpSplitter } from './follow-ups'
import { generateImages, imagesConfig, ImagesFailed, type ImageSize, type MadeImage } from './image-generation'
import { summariseValue, validateBenchmark } from './ai-value'
import { formatStandupFallback, type StandupData } from '../people/standup'
import { DEFAULT_TIER, isSelectableTier, modelForTier, type ModelTier } from './model-tiers'
import { rollUpByCategory } from './ai-categories'
import {
  fallbackProposal,
  noPatternsFound,
  parseMinedSkills,
  parseSkillProposal,
  renderProposal,
  type MinedSkill,
  type ProposalStep,
  type SkillProposal,
} from '../skills/skill-proposal'
import { R2Service } from '../../common/storage/r2.service'
import { estimateAiCostUsd } from './ai-cost'
import { TasksService } from '../tasks/tasks.service'
import { ListsService } from '../lists/lists.service'
import { FoldersService } from '../folders/folders.service'
import { CustomRolesService } from '../custom-roles/custom-roles.service'
import { EmbeddingService } from './embedding.service'
import { embedText, cosineSimilarity } from './embedding'
import { ATTACHMENT_TEXT_CAP, extractAttachmentText, isExtractableAttachment } from './attachment-text'
import { isLinkAttachmentKey } from '../tasks/task-object-keys'
import {
  checkContainerAccess,
  containerVisibilityFilter,
  isWorkspaceManager,
  spaceVisibilityFilter,
  taskInReachFilter,
} from '../../common/permissions/container-access.guard-helper'
import { isUuid } from '../../common/validation/uuid'
import { resolveIsManager, taskVisibilityFilter, listVisibilityFilter } from '../../common/permissions/item-visibility'
import { hiddenDocIds } from '../../common/permissions/doc-access'
import { readableTask } from '../../common/permissions/read-access'
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
  CONTAINER_TOOLS,
  CONTAINER_TOOL_INSTRUCTION,
  REFERENCE_INSTRUCTION,
  containerPath,
  describeContainerResult,
  enabledViewsFor,
  isContainerTool,
  refuse,
  resolveContainerSpace,
  toolString,
  type ContainerSpace,
  type ContainerToolResult,
} from './ai-containers'
import {
  contextualCardCount,
  overdueBefore,
  starterCards,
  type StarterCard,
  type StarterFacts,
  type StarterSurface,
} from './ai-starters'
import {
  ASSIGN_TOOLS,
  describeAssignSuggestion,
  isAssignTool,
  rankAssignees,
  refuseAssign,
  type AssigneeCandidate,
  type AssignResult,
} from './ai-assign'
/*
 * The server's ONE list of view keys, imported rather than restated. Four
 * copies of this set already exist in the tree and two of them had drifted
 * (the wizard and the space-views dialog both lost `team`); a fifth written
 * here would be the same bug with a new address.
 */
import { SPACE_VIEW_KEYS } from '../spaces/space-presets'
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

/**
 * §V2-11 — which `ai_usage` rows the hourly cap counts, now that failures land
 * in the same table.
 *
 * THIS IS A REGRESSION THAT 0150 WOULD OTHERWISE HAVE INTRODUCED, and it is
 * worth spelling out. The cap is `count(*)` over an hour of `ai_usage`. Start
 * writing failures into that table and a workspace with no API key configured
 * would rack up two hundred `not_configured` rows and lock itself out for an
 * hour — the limiter charging people for the calls it refused to make.
 *
 * So the cap counts what actually reached the provider: successes, and
 * provider errors (a 500 from the model still consumed a request). Runs this
 * service turned away itself — `not_configured`, `rate_limited` — are recorded
 * for the activity log and excluded from the count that produced them.
 */
const COUNTS_TOWARD_LIMIT = sql`(${aiUsage.errorCode} is null or ${aiUsage.errorCode} = 'provider_error')`

/** `ai_usage.status`, as the activity log filters on it. */
export type AiRunStatus = 'succeeded' | 'failed'

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

/**
 * §V2-S16 — the ids a `[[task:…]]` / `[[list:…]]` batch may actually contain.
 *
 * Every id here addresses a `uuid` column, so a value that cannot be one is a
 * query Postgres refuses (a 500) rather than a lookup that misses. Filtered and
 * capped rather than rejected wholesale: an answer with one malformed reference
 * in it should resolve the other nine, and the cap stops a crafted message
 * turning one chip render into a thousand-id `IN` list.
 */
const REF_BATCH_CAP = 60
function uniqueUuids(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  for (const v of values) {
    if (typeof v !== 'string') continue
    const id = v.trim().toLowerCase()
    if (isUuid(id)) seen.add(id)
    if (seen.size >= REF_BATCH_CAP) break
  }
  return [...seen]
}

/**
 * §V2-S16 frame `19:50`→`20:10` — the **Project Status** card's answer:
 * *"13 open tasks total: 11 To Do, 1 In Progress, 1 Complete"*, a
 * whole-workspace count broken down by status.
 *
 * One row per STATUS, carrying its category, plus the id of the task so a
 * chip can address it. Built once by `workspaceStatusBreakdown` and read by
 * both the context string and `GET /ai/project-status`, so the sentence and
 * the number a person can check against cannot disagree.
 */
export type WorkspaceStatusBreakdown = {
  /** Every non-archived task the caller can see. Not "open" — see the note. */
  total: number
  byCategory: { open: number; in_progress: number; closed: number }
  /** Sorted by count, descending, then by status key, so it is stable. */
  byStatus: Array<{ status: string; statusCategory: StatusCategory; count: number }>
}

export type WorkspaceContextData = {
  workspaceName: string
  role: string
  counts: { spaces: number; projects: number; lists: number; openTasks: number }
  spaces: Array<{ name: string; projects: string[] }>
  openTasks: Array<{ title: string; dueDate: Date | string | null; priority: string }>
  history: Array<{ title: string; status: string; updatedAt: Date | string | null }>
  currentView?: string
  /**
   * §V2-S16 — the breakdown behind a project-status answer.
   *
   * Optional so every existing caller and unit construction is unchanged; when
   * absent no breakdown line is emitted, which is honest — the previous
   * behaviour was one aggregate labelled "Workspace totals" sitting beside the
   * caller's OWN fifteen tasks, which is one careless sentence away from being
   * summarised as if the personal list were the workspace's breakdown.
   */
  statusBreakdown?: WorkspaceStatusBreakdown
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

  /*
   * §V2-S16 `20:10` — the per-status breakdown, and WHY IT IS LABELLED SO
   * HEAVILY.
   *
   * Asked to "summarize all current tasks", the model previously had one total
   * and fifteen of the CALLER'S OWN rows to answer from. The likeliest way to
   * write that up is to describe your own list and attach the workspace total
   * to it — an answer that is wrong in a way nobody in the room can detect.
   *
   * So the two are named apart, out loud: this block says it covers everybody,
   * the block below says it is only yours, and the numbers here are a real
   * GROUP BY rather than an arithmetic on the fifteen.
   */
  if (data.statusBreakdown) {
    const b = data.statusBreakdown
    const perStatus = b.byStatus.length
      ? b.byStatus.map((s) => `${s.count} ${s.status}`).join(', ')
      : 'none'
    lines.push(
      'Task status breakdown (EVERY task in this workspace you can see, not just yours):\n' +
        `- ${b.total} tasks in total\n` +
        `- by category: ${b.byCategory.open} open, ${b.byCategory.in_progress} in progress, ${b.byCategory.closed} closed\n` +
        `- by status: ${perStatus}`,
    )
  }

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

/**
 * G13-10 [18:33–18:36] — one SSE stream, opened once.
 *
 * Fastify's reply has no setHeader/write/end, so this reaches for the
 * underlying Node response and hijacks the reply so Fastify does not also try
 * to send one. Extracted because the trace and the answer now share a stream:
 * the caller opens it to report what it is reading, and `chatStream` writes
 * the answer into the same one. Calling setHeader a second time after the
 * headers have flushed throws, so there has to be exactly one opener.
 */
export type SseStream = { write: (chunk: string) => void; end: () => void }

export function openSseStream(res: Response): SseStream {
  const reply = res as any
  if (typeof reply.hijack === 'function') reply.hijack()
  const raw = reply.raw ?? reply
  raw.setHeader('Content-Type', 'text/event-stream')
  raw.setHeader('Cache-Control', 'no-cache')
  raw.setHeader('Connection', 'keep-alive')
  raw.flushHeaders?.()
  return raw as SseStream
}

@Injectable()
export class AiService {
  private client: Anthropic | null = null

  constructor(
    private config: ConfigService,
    @Inject(DB_TOKEN) private db: Db,
    private tasks: TasksService,
    /*
     * §15.1 Knowledge base retrieval — via vector similarity (EmbeddingService
     * + knowledge_embeddings). @Optional so the many unit tests that construct
     * `new AiService(config, db, tasks)` keep compiling; injected in production
     * (EmbeddingService lives in AiModule).
     *
     * §V2-S16 — SEARCHSERVICE USED TO BE INJECTED HERE and never called. The
     * comment above it said it was "retained for other surfaces", which is a
     * stale reason of the exact kind this audit names: within this class it was
     * retained for none (`grep "this.search"` returned nothing), and a reason
     * suppresses the investigation that would have found that. Removed rather
     * than left standing — when a connected-app search lands it can be injected
     * by the code that calls it.
     */
    @Optional() private embeddings?: EmbeddingService,
    // §15.1 — used to hydrate attachment hits with their extracted text at
    // answer-time (the embeddings table stores only title/url). @Optional so the
    // many `new AiService(config, db, tasks)` unit constructions keep compiling;
    // injected in production (StorageModule is @Global). When absent, attachment
    // citations simply carry no body — the answer path degrades gracefully.
    @Optional() private r2?: R2Service,
    /*
     * §V2-S16 `[17:44]`–`[18:48]` — the services that actually WRITE a
     * container, and the one that answers whether this actor may.
     *
     * Reached through the same services the REST routes call rather than by
     * inserting rows here, for one reason that matters more than tidiness: a
     * list created by a raw insert gets no status pipeline, and a list with no
     * statuses accepts `status = 'done'` while keeping `status_category =
     * 'open'` forever. `ListsService.createList` calls `seedListStatuses`; a
     * second creation path would be the seventh place that forgot.
     *
     * @Optional, like the rest, so the unit constructions keep compiling — and
     * when absent the tools REFUSE with `unavailable` rather than reporting a
     * success they did not perform. `test/e2e/ai-create-containers.mjs` proves
     * they are wired in the running app by asserting the row in Postgres.
     */
    @Optional() private lists?: ListsService,
    @Optional() private folders?: FoldersService,
    @Optional() private roles?: CustomRolesService,
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

  async assertWithinRateLimit(ctx: AiCtx, now: Date = new Date(), feature = 'unknown') {
    const since = new Date(now.getTime() - 3_600_000)
    if (ctx.userId) {
      const [row] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(aiUsage)
        .where(and(eq(aiUsage.userId, ctx.userId), gte(aiUsage.createdAt, since), COUNTS_TOWARD_LIMIT))
      if ((row?.c ?? 0) >= this.hourlyLimit) {
        const message = `AI hourly rate limit reached (${this.hourlyLimit}/hour). Try again later.`
        await this.recordFailure(feature, 'rate-limited', ctx, 'rate_limited', message)
        throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
      }
    }
    // Per-organization (workspace) cap (Plan §7.15).
    if (ctx.workspaceId) {
      const [row] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(aiUsage)
        .where(and(eq(aiUsage.workspaceId, ctx.workspaceId), gte(aiUsage.createdAt, since), COUNTS_TOWARD_LIMIT))
      if ((row?.c ?? 0) >= this.orgHourlyLimit) {
        const message = `Workspace AI hourly limit reached (${this.orgHourlyLimit}/hour). Try again later.`
        await this.recordFailure(feature, 'rate-limited', ctx, 'rate_limited', message)
        throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
      }
    }
  }

  /**
   * PICTURES OF A PROMPT (`ledger-rows/row-870`, `image-generation.ts`): counted
   * against the hour's AI allowance like any run, and written down as one run of
   * `image.generate` — the "Images generated" tile — whether it worked or not.
   * The image service's refusals are said: its rate limit as too many requests,
   * a prompt it would not draw in its own words, anything else as a service
   * that did not answer.
   */
  async makeImages(prompt: string, count: number, size: ImageSize, ctx: AiCtx): Promise<{ images: MadeImage[]; model: string }> {
    const cfg = imagesConfig()
    if (!cfg) {
      const message = 'Image generation is not set up on this server'
      await this.recordFailure('image.generate', 'none', ctx, 'not_configured', message)
      throw new HttpException(message, HttpStatus.SERVICE_UNAVAILABLE)
    }
    await this.assertWithinRateLimit(ctx, new Date(), 'image.generate')
    try {
      const images = await generateImages(cfg, prompt, count, size)
      void this.recordUsage('image.generate', cfg.model, ctx, 0, 0)
      return { images, model: cfg.model }
    } catch (err) {
      const status = err instanceof ImagesFailed ? err.status : 0
      const said = err instanceof Error ? err.message : 'Image generation failed'
      await this.recordFailure('image.generate', cfg.model, ctx, 'provider_error', said)
      if (status === 429) throw new HttpException('The image service has had too many requests for now — try again in a while', HttpStatus.TOO_MANY_REQUESTS)
      if (status === 400) throw new HttpException(`The image service would not make that: ${said}`, HttpStatus.BAD_REQUEST)
      throw new HttpException('The image service did not answer — try again', HttpStatus.BAD_GATEWAY)
    }
  }

  /**
   * §V2-11 — the guard that used to be twelve copies of `if (!isAvailable())`
   * in the controller, each throwing a 503 and recording nothing.
   *
   * It records first and throws second, because "AI features are not
   * configured" is a FAILED RUN from the point of view of the person who asked
   * for one, and until 0150 it was the single most common AI failure in this
   * product and left no trace anywhere. A Status filter with no failures behind
   * it is a dropdown with one reachable value.
   */
  async assertAvailable(feature: string, ctx: AiCtx = {}) {
    if (this.isAvailable()) return
    const message = 'AI features are not configured'
    await this.recordFailure(feature, 'none', ctx, 'not_configured', message)
    throw new HttpException(message, HttpStatus.SERVICE_UNAVAILABLE)
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
    await this.assertWithinRateLimit(ctx, new Date(), feature)
    // Prompt caching: mark the (repeated) system prompt as a cache breakpoint.
    const finalParams: Anthropic.Messages.MessageCreateParamsNonStreaming =
      typeof params.system === 'string' && params.system.length > 200
        ? { ...params, system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }] }
        : params
    /*
     * §V2-11 — THE OTHER HALF OF THE STATUS COLUMN.
     *
     * Every non-streaming AI call funnels through here, so this is the one
     * place a provider failure can be written down without adding a catch to
     * forty call sites. The error is rethrown untouched: this records, it does
     * not handle. Swallowing it here would turn an outage into forty callers
     * quietly returning their fallbacks.
     */
    let response: Anthropic.Messages.Message
    try {
      response = await this.claude.messages.create(finalParams)
    } catch (err) {
      await this.recordFailure(
        feature,
        params.model,
        ctx,
        'provider_error',
        err instanceof Error ? err.message : 'AI request failed',
      )
      throw err
    }
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
        status: 'succeeded',
      })
    } catch {
      // Usage tracking must never break an AI response.
    }
  }

  /**
   * §V2-11, frame `19:05` — a run that did not work, written down.
   *
   * AWAITED, unlike `recordUsage`. A success is recorded alongside a response
   * that is already on its way back, so a fire-and-forget write costs nobody
   * anything. A failure is recorded on the way OUT of a request that is about
   * to throw, and `void`-ing it there is how the row loses the race with the
   * response and the Status filter comes up empty exactly when it matters.
   *
   * Zero tokens, because nothing was generated. `error_message` is capped at
   * 500 characters: a provider stack trace in a log row is not a sentence
   * anybody reads, and the column is rendered in a list.
   */
  async recordFailure(
    feature: string,
    model: string,
    ctx: AiCtx,
    errorCode: 'not_configured' | 'rate_limited' | 'provider_error',
    errorMessage: string,
  ) {
    try {
      await this.db.insert(aiUsage).values({
        workspaceId: ctx.workspaceId ?? null,
        userId: ctx.userId ?? null,
        feature,
        model,
        inputTokens: 0,
        outputTokens: 0,
        status: 'failed',
        errorCode,
        errorMessage: (errorMessage ?? '').slice(0, 500) || null,
      })
    } catch {
      // Recording a failure must never become a second failure.
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

    /*
     * §V2-11 — SUCCEEDED RUNS ONLY, and this is load-bearing.
     *
     * Before 0150 every row in `ai_usage` was a success, so `count(*)` and "how
     * many runs happened" were the same number. Now that failures are recorded
     * they are not, and every figure the value panel shows is derived from this
     * count: a workspace with no API key would have reported hundreds of runs
     * and hours of time saved on calls that never happened. A failed run cost
     * nothing and saved nobody any time.
     *
     * The activity log (`runLog`) deliberately does NOT do this — showing both
     * is the entire point of the Status filter.
     */
    const filters = [eq(aiUsage.status, 'succeeded')]
    if (opts.workspaceId) filters.push(eq(aiUsage.workspaceId, opts.workspaceId))
    if (opts.from) filters.push(gte(aiUsage.createdAt, opts.from))
    if (opts.to) filters.push(lte(aiUsage.createdAt, opts.to))
    const where = and(...filters)

    const rows = await this.db
      .select({
        userId: aiUsage.userId,
        model: aiUsage.model,
        // §V2-11 — grouped by feature too, so the value panel can attribute a
        // saving to what produced it. A total nobody can break down is a total
        // nobody believes.
        feature: aiUsage.feature,
        inTok: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::int`,
        outTok: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::int`,
        calls: sql<number>`count(*)::int`,
      })
      .from(aiUsage)
      .where(where)
      .groupBy(aiUsage.userId, aiUsage.model, aiUsage.feature)

    let totalCost = 0
    let totalCalls = 0
    let totalIn = 0
    let totalOut = 0
    const byUser: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }> = {}
    const byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }> = {}
    const byFeature: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }> = {}
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
      const f = (byFeature[r.feature] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 })
      f.calls += r.calls; f.inputTokens += r.inTok; f.outputTokens += r.outTok; f.costUsd += cost
    }
    const round = (n: number) => Math.round(n * 10000) / 10000
    return {
      totals: { calls: totalCalls, inputTokens: totalIn, outputTokens: totalOut, costUsd: round(totalCost) },
      byUser: Object.fromEntries(Object.entries(byUser).map(([k, v]) => [k, { ...v, costUsd: round(v.costUsd) }])),
      byModel: Object.fromEntries(Object.entries(byModel).map(([k, v]) => [k, { ...v, costUsd: round(v.costUsd) }])),
      byFeature: Object.fromEntries(Object.entries(byFeature).map(([k, v]) => [k, { ...v, costUsd: round(v.costUsd) }])),
    }
  }

  /**
   * §V2-11, frames `19:00`/`19:05` — what the AI was WORTH, beside what it cost.
   *
   * Shares `usageSummary`'s access check by calling it: spend and per-person
   * usage are workspace-confidential, and a second endpoint answering the same
   * question through a second, subtly different guard is how a leak happens.
   */
  async valueSummary(opts: { workspaceId: string; from?: Date; to?: Date; actor: { id: string; role?: string } }) {
    const usage = await this.usageSummary(opts)
    const [ws] = await this.db
      .select({
        minutes: workspaces.aiMinutesSavedPerRun,
        rate: workspaces.aiHourlyRateCents,
      })
      .from(workspaces)
      .where(eq(workspaces.id, opts.workspaceId))
      .limit(1)
    if (!ws) throw new NotFoundException('Workspace not found')

    /*
     * §V2-11, frames `18:53`/`18:56`/`18:59` — the eight tiles, GROUPED HERE
     * rather than in the panel.
     *
     * The panel had the raw per-feature map and would have had to invent the
     * taxonomy itself, which means the next reader — a report, an export, the
     * usage tab — invents its own and the two drift. Rolled up once, server
     * side, the numbers cannot disagree between callers because there is only
     * one place they are computed.
     *
     * `byFeature` stays exactly as it was. The categories are a level ABOVE
     * it, not a replacement, and the Activity tab's feature filter reads the
     * detail.
     */
    const rollup = rollUpByCategory(usage.byFeature)

    return {
      ...summariseValue(usage.totals.calls, usage.totals.costUsd, {
        minutesSavedPerRun: ws.minutes,
        hourlyRateCents: ws.rate,
      }),
      // Carried through so the panel can break the saving down by what produced
      // it — a total nobody can attribute is a total nobody believes.
      byFeature: usage.byFeature,
      byCategory: rollup.categories,
      /*
       * Features the taxonomy does not know about. Returned rather than
       * dropped: runs that happened and appear in no tile are a confident zero,
       * and a caller that can see the list can say so instead of quietly
       * under-reporting.
       */
      uncategorisedFeatures: rollup.unmapped,
    }
  }

  /**
   * §V2-11 — "Edit benchmark", frame `19:00`.
   *
   * Admin-only, because it changes a number the whole workspace is shown and
   * that somebody may put in front of a client. Validated here as well as by
   * the database's CHECK: the API should refuse with a sentence, not surface a
   * constraint violation.
   */
  async updateValueBenchmark(
    workspaceId: string,
    actor: { id: string; role?: string },
    patch: { minutesSavedPerRun?: number; hourlyRateCents?: number },
  ) {
    if (actor.role !== 'super_admin') {
      const [member] = await this.db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actor.id)))
        .limit(1)
      if (!member) throw new ForbiddenException('Workspace membership required')
      if (!isManagerRole(member.role as string)) {
        throw new ForbiddenException('Only a workspace admin can change the AI benchmark')
      }
    }
    const problem = validateBenchmark(patch)
    if (problem) throw new BadRequestException(problem)

    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.minutesSavedPerRun !== undefined) set.aiMinutesSavedPerRun = patch.minutesSavedPerRun
    if (patch.hourlyRateCents !== undefined) set.aiHourlyRateCents = patch.hourlyRateCents
    const [row] = await this.db
      .update(workspaces)
      .set(set)
      .where(eq(workspaces.id, workspaceId))
      .returning({ minutes: workspaces.aiMinutesSavedPerRun, rate: workspaces.aiHourlyRateCents })
    if (!row) throw new NotFoundException('Workspace not found')
    return { minutesSavedPerRun: row.minutes, hourlyRateCents: row.rate }
  }

  /**
   * §V2-11, frame `19:05` — the Activity log: one row per AI run.
   *
   * The frame's filter row is `Date run ▾ · Status ▾ · My agents · Agent ▾`.
   * Three of the four now have a counterpart:
   *
   *   · **Date run** — `from`/`to`, which the range buttons drive.
   *   · **Status** — `status`, real as of 0150. See `recordFailure`: until then
   *     only successes were written, so this filter could not have existed
   *     without first building the thing it filters on.
   *   · **My agents** — `userId`. THE ENDPOINT ALWAYS TOOK THIS PARAMETER and
   *     the web client never sent it, so the toggle that existed was a UI-only
   *     build: it re-rendered and asked the server for exactly the same rows.
   *     Rundesk has no agents, so the honest reading of "mine" is "runs I
   *     started", and the label says that rather than borrowing a word for a
   *     thing this product does not have.
   *   · **Agent** — still nothing to filter on, still deliberate. A dropdown
   *     over a product with no agents can only ever return everything.
   *
   * Capped and newest-first. An unbounded log of every model call a busy
   * workspace has ever made is a page that never finishes rendering.
   */
  async runLog(opts: {
    workspaceId: string
    actor: { id: string; role?: string }
    from?: Date
    to?: Date
    feature?: string
    userId?: string
    status?: AiRunStatus
    limit?: number
  }) {
    // Same confidentiality as the summary, asserted the same way.
    await this.usageSummary({ workspaceId: opts.workspaceId, actor: opts.actor })

    const filters = [eq(aiUsage.workspaceId, opts.workspaceId)]
    if (opts.from) filters.push(gte(aiUsage.createdAt, opts.from))
    if (opts.to) filters.push(lte(aiUsage.createdAt, opts.to))
    if (opts.feature) filters.push(eq(aiUsage.feature, opts.feature))
    if (opts.userId) filters.push(eq(aiUsage.userId, opts.userId))
    if (opts.status) filters.push(eq(aiUsage.status, opts.status))

    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
    const rows = await this.db
      .select({
        id: aiUsage.id,
        feature: aiUsage.feature,
        model: aiUsage.model,
        inputTokens: aiUsage.inputTokens,
        outputTokens: aiUsage.outputTokens,
        createdAt: aiUsage.createdAt,
        userId: aiUsage.userId,
        status: aiUsage.status,
        errorCode: aiUsage.errorCode,
        errorMessage: aiUsage.errorMessage,
      })
      .from(aiUsage)
      .where(and(...filters))
      .orderBy(desc(aiUsage.createdAt))
      .limit(limit)

    return rows.map((r) => ({
      ...r,
      costUsd: Math.round(estimateAiCostUsd(r.model, r.inputTokens, r.outputTokens) * 10000) / 10000,
    }))
  }

  /**
   * §V2-S18 `[17:32]` — "apna [preferred] AI bhi set down karna hai."
   *
   * Read from the database rather than from the browser. The preference has
   * existed since §15 and lived in `localStorage` under `rundesk.aiTier`, which
   * meant the thing the frame calls *your preferred AI* did not survive a
   * second machine, a second browser, or a cleared cache — it was a habit, not
   * a setting.
   *
   * Absent is a legitimate answer: it means "never chosen", and the caller uses
   * `DEFAULT_TIER`, which is exactly what chat used before a picker existed.
   */
  async modelPreference(userId: string, workspaceId: string): Promise<{
    preferredTier: ModelTier['id']
    /** False when nothing is stored, so the surface can say "not set" honestly. */
    isSet: boolean
    updatedAt: Date | null
  }> {
    const [row] = await this.db
      .select({ tier: aiModelPreferences.preferredTier, updatedAt: aiModelPreferences.updatedAt })
      .from(aiModelPreferences)
      .where(and(eq(aiModelPreferences.userId, userId), eq(aiModelPreferences.workspaceId, workspaceId)))
      .limit(1)
    // A value that stopped being a tier (a renamed tier, a hand-edited row) is
    // reported as unset rather than echoed back: the picker would have nothing
    // to select, and `modelForTier` would silently answer with the default
    // anyway. Saying "not set" is the same behaviour, told truthfully.
    if (!row || !isSelectableTier(row.tier)) {
      return { preferredTier: DEFAULT_TIER, isSet: false, updatedAt: null }
    }
    return { preferredTier: row.tier, isSet: true, updatedAt: row.updatedAt }
  }

  /**
   * Store somebody's preferred tier for this workspace.
   *
   * REFUSES ANYTHING THAT IS NOT A ROUTABLE TIER rather than coercing it. The
   * frame offers ChatGPT and Gemini and this product has no client for either
   * (`UNROUTABLE_PROVIDERS`); accepting `openai` here and quietly resolving it
   * to Claude is how "I set Gemini and it saved" becomes true on a product that
   * cannot run Gemini. The row would round-trip through Postgres and mean
   * nothing — the mirror of a facade, and worse, because the database would
   * then be evidence for a feature that does not exist.
   */
  async setModelPreference(userId: string, workspaceId: string, preferredTier: string) {
    if (!isSelectableTier(preferredTier)) {
      throw new BadRequestException(
        `"${preferredTier}" is not a model this workspace can route to`,
      )
    }
    const [member] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!member) throw new ForbiddenException('Workspace membership required')

    // Upsert on the unique (user, workspace) index — one statement, so two
    // tabs pressing "set as preferred" at once cannot insert two rows.
    await this.db
      .insert(aiModelPreferences)
      .values({ userId, workspaceId, preferredTier })
      .onConflictDoUpdate({
        target: [aiModelPreferences.userId, aiModelPreferences.workspaceId],
        set: { preferredTier, updatedAt: new Date() },
      })
    return this.modelPreference(userId, workspaceId)
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

  /**
   * §2.8 gap 10 — write the meeting notes from what was said.
   *
   *   `[20:42]` "main record karoongi aur yeh aap ke khud hi NOTES bana ke
   *   dega aur poori ki poori RECORDING bhi karega — poori call hi ki."
   *
   * The transcript arrives attributed ("Hamda: ...") because each person's own
   * browser transcribes their own microphone, so the model can say who owns
   * what — which is the difference between notes and a wall of text.
   *
   * Prose, not JSON: this goes into `meetings.notes`, which a person reads.
   * Action items are extracted separately by the extractor that already
   * exists, from these same notes.
   */
  async notesFromTranscript(transcript: string, ctx: AiCtx = {}): Promise<string> {
    const response = await this.complete('meeting.transcript', ctx, {
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `You write the notes for a meeting from its transcript.

The transcript is live speech-to-text, so it is messy: false starts, filler,
mis-heard words, and people talking over each other. Read past that.

Write in Markdown, in this order, and leave out any section there is nothing
real to put in — an empty "Decisions" heading is worse than no heading:

## Summary
Two or three sentences on what this call was actually about.

## Decisions
What was settled, one per line.

## Action items
"- **Name** — what they said they would do (by when, if a time was said)"

## Open questions
What was raised and not resolved.

Rules that matter:
- Attribute by the names in the transcript. Never invent a name.
- Only write what was said. If the call was short or inconclusive, say so in
  the summary and stop — do not pad it into something that sounds productive.
- Speech-to-text mangles names and jargon. If a word is clearly garbled but
  recoverable from context, use the sensible reading; if it is not, leave it
  out rather than guessing at a commitment somebody did not make.`,
      messages: [{ role: 'user', content: `Transcript:\n\n${transcript}` }],
    })
    return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
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

  /**
   * A reply to a task's comment thread, drafted from the task — its
   * description, activity and comments, what Summarize reads — for the reader
   * to keep or not. What they want it to say, if anything, goes with the task,
   * not into the instructions (`found-29-sep/task-brain-offers-list-starters`).
   */
  async draftCommentReply(content: string, instruction: string, ctx: AiCtx = {}): Promise<string> {
    const response = await this.complete('comment.reply', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: `You draft replies to a task's comment thread in Rundesk.
Write one reply in plain text, one to three sentences, answering the most recent comments in the thread, in the voice of the person asking. No greeting and no sign-off.`,
      messages: [
        { role: 'user', content: instruction ? `${content}\n\nWhat the reply should say: ${instruction}` : content },
      ],
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
    /**
     * §15 — the composer's model picker. Omitted or unrecognised resolves to
     * the tier chat already used, so nothing changes for a caller that does not
     * pass one.
     */
    tier?: string,
    /**
     * G13-10 — an SSE stream the caller already opened so it could report its
     * own retrieval steps before the model was ever called. When absent this
     * opens its own, so every existing caller is unaffected.
     */
    opened?: SseStream,
    /**
     * §V2-S16 `[17:44]`–`[18:48]` — the actor on whose behalf a container tool
     * may run. Omitted means NO TOOLS ARE OFFERED, which is why an ordinary
     * caller and every unit construction behave exactly as before.
     *
     * It carries the actor rather than a boolean because a tool that writes
     * needs somebody to be responsible for the write: there is no "the
     * assistant did it" row in this product, and there should not be one.
     */
    agent?: { workspaceId: string; userId: string },
  ): Promise<void> {
    // Enforce rate limits before we hijack the reply for streaming.
    await this.assertWithinRateLimit(ctx, new Date(), 'chat')
    const model = modelForTier(tier)

    /*
     * §V2-S16 — WHEN THE ASK SURFACE GETS TOOLS, and when it must not.
     *
     * Not under a skill. A rendered skill prompt ends with the boundary
     * sentence "You shape this reply; you do not take actions on your own" —
     * handing that same turn a tool that writes would contradict the one line
     * the skill's author was promised would be the last word.
     *
     * Not without an actor, and not without the services that write. In both
     * cases the tools are simply absent rather than present-and-failing: a tool
     * the model can call that cannot work is the worst version of this row.
     */
    const canAct = !!agent && !skillPrompt?.trim() && !!this.lists && !!this.folders
    /*
     * §V2-S17 `15:50` — and the one tool here that does NOT write.
     *
     * `suggest_assignee` reads three numbers per candidate and returns a
     * recommendation; the assignment itself stays behind `assign_task` and the
     * confirm step. Offered on the same gate as the writers rather than a
     * looser one, because it reports one person's workload to another and that
     * is not a thing a skill-shaped turn should be able to reach for either.
     */
    const tools = canAct ? [...CONTAINER_TOOLS, ...ASSIGN_TOOLS] : []

    const intro = skillPrompt?.trim()
      ? skillPrompt.trim()
      : `You are Rundesk AI, an intelligent assistant embedded in the Rundesk project management platform.
You help users manage tasks, understand their workspace, draft messages, generate content, and answer questions.
Be concise, helpful, and action-oriented.`

    /*
     * Appended AFTER the follow-up instruction, and never inserted between
     * "Workspace context:" and the context itself — `skill-chat.test.ts` pins
     * that adjacency, and it pins it because a block wedged in there is a block
     * the model reads as part of the workspace.
     */
    const agentPrompt = canAct ? `\n\n${CONTAINER_TOOL_INSTRUCTION}\n\n${REFERENCE_INSTRUCTION}` : ''
    const systemPrompt = `${intro}

Workspace context:
${workspaceContext}

Current date: ${new Date().toISOString().split('T')[0]}

${FOLLOW_UP_INSTRUCTION}${agentPrompt}`

    // Already open when the caller reported its own steps first (G13-10);
    // otherwise open it here. Calling setHeader twice throws once the headers
    // have been flushed, which is why this is a branch rather than a re-run.
    const raw = opened ?? openSseStream(res)

    try {
      /*
       * G13-10 [18:33–18:36] — the last step, named where it happens.
       *
       * Everything above this line is retrieval the caller already reported.
       * This one belongs to the model call, so it is written here rather than
       * guessed at by the controller — a step that claims work happening
       * somewhere else is how a trace stops being evidence.
       */
      raw.write(`data: ${JSON.stringify({ step: 'writing' })}\n\n`)

      /*
       * G13-9 [18:42] — the follow-ups ride this same completion, after a
       * marker, so offering them costs no second billed call on every turn.
       * The splitter keeps that trade honest: it holds back exactly the
       * characters that could still become the marker, so a reader never sees
       * `<<<FOLLOW` when a chunk boundary lands mid-marker, and ordinary prose
       * is never delayed.
       *
       * ONE splitter across the whole turn, including across a tool call: text
       * before the tool and text after it are one answer, and a second splitter
       * would re-arm the marker search halfway through a sentence.
       */
      const followUps = createFollowUpSplitter()
      /*
       * §V2-S16 — the turn, which is a loop now rather than a single call.
       *
       * Bounded at three passes. A model that keeps asking for tools past that
       * is not converging, and an unbounded loop here is an unbounded bill.
       * `turns === 1` when no tools are offered, so a chat turn without an
       * actor is byte-identical to what it was.
       */
      const MAX_TOOL_PASSES = tools.length ? 3 : 1
      const convo: Anthropic.Messages.MessageParam[] = [...messages]
      /*
       * The space catalog, read ONCE PER TURN and only when a tool is actually
       * called.
       *
       * Once, because the catalog cannot change mid-answer and two reads invite
       * the two to disagree about which space "rundesk" is. Only on demand,
       * because `loadCommandContext` is a four-query read and the overwhelming
       * majority of chat turns never touch a tool — paying for it on all of
       * them to serve a few would be a tax nobody could see on the screen.
       */
      let spacesPromise: Promise<ContainerSpace[]> | null = null
      const spaceCatalog = () => {
        spacesPromise ??= (async () =>
          agent
            ? await this.loadCommandContext(agent.workspaceId, agent.userId)
                .then((c) => c.spaces ?? [])
                .catch(() => [] as ContainerSpace[])
            : [])()
        return spacesPromise
      }

      let final: Anthropic.Messages.Message | null = null
      for (let pass = 0; pass < MAX_TOOL_PASSES; pass += 1) {
        const stream = this.claude.messages.stream({
          model,
          max_tokens: 2048,
          // Cache the (large, repeated) system context across turns.
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages: convo,
          ...(tools.length ? { tools } : {}),
        })

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const visible = followUps.push(chunk.delta.text)
            if (visible) raw.write(`data: ${JSON.stringify({ delta: visible })}\n\n`)
          }
        }
        final = await stream.finalMessage().catch(() => null)
        /*
         * ONE `ai_usage` ROW PER CALL TO THE MODEL, which is what the Analytics
         * panel's unit note says a run is. A loop that recorded once per TURN
         * would quietly make two model calls look like one, and every figure on
         * that page is a count of this table.
         */
        void this.recordUsage('chat', model, ctx, final?.usage?.input_tokens ?? 0, final?.usage?.output_tokens ?? 0)

        const toolUses = ((final?.content ?? []) as Anthropic.Messages.ContentBlock[]).filter(
          (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
        )
        if (!toolUses.length || !canAct || !agent) break

        convo.push({ role: 'assistant', content: final!.content })
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
        for (const use of toolUses) {
          const input = (use.input ?? {}) as Record<string, unknown>
          /*
           * §V2-S16 frame `18:45` — *"Creating the new rundesk list"*, written
           * BEFORE the write and naming the thing being written.
           *
           * The step carries the tool name rather than a sentence so the wire
           * stays a stable key and the panel owns the words, exactly as the
           * three retrieval steps already do.
           */
          raw.write(`data: ${JSON.stringify({ step: use.name })}\n\n`)
          /*
           * §V2-S17 `15:50` — the read-only one, answered from the database and
           * handed back as the deterministic sentence.
           *
           * Branching here rather than inside `runContainerTool` because that
           * method's whole contract is "this writes a container"; folding a
           * read into it would make its refusal vocabulary mean two things.
           */
          if (isAssignTool(use.name)) {
            const suggestion = await this.suggestAssignee(toolString(input.taskId), agent.userId)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: use.id,
              is_error: !suggestion.ok,
              content: JSON.stringify({ ...suggestion, say: describeAssignSuggestion(suggestion) }),
            })
            continue
          }
          const result = await this.runContainerTool(use.name, input, agent, await spaceCatalog())
          /*
           * The tool result is the DETERMINISTIC sentence built from the row,
           * not a re-description. The model is free to add to it; it is not
           * free to be the only source of what happened.
           */
          toolResults.push({
            type: 'tool_result',
            tool_use_id: use.id,
            is_error: !result.ok,
            content: JSON.stringify({
              ...result,
              say: describeContainerResult(result),
            }),
          })
          // And the client is told, on the wire, what now exists — so the panel
          // can chip it without parsing the prose.
          if (result.ok) {
            raw.write(
              `data: ${JSON.stringify({
                created: { kind: result.kind, id: result.id, name: result.name, path: result.path },
              })}\n\n`,
            )
          }
        }
        convo.push({ role: 'user', content: toolResults })
      }

      // Anything still held back was never a marker and belongs to the answer.
      const tail = followUps.flush()
      if (tail) raw.write(`data: ${JSON.stringify({ delta: tail })}\n\n`)
      const suggestions = followUps.followUps()
      if (suggestions.length) raw.write(`data: ${JSON.stringify({ followUps: suggestions })}\n\n`)
      raw.write('data: [DONE]\n\n')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI request failed'
      // §V2-11 — a stream that died is a failed run. The client sees `{error}`
      // and always did; until 0150 nothing else ever did.
      await this.recordFailure('chat', model, ctx, 'provider_error', message)
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
      /*
       * WHAT THE CALLER MAY SEE, AND NOTHING ELSE, goes into the prompt. Every
       * query below read the whole workspace: measured on lane 1, a member
       * refused a private space got a prompt naming it, and its project, under
       * "Workspace structure", and the totals and the breakdown counted its
       * tasks. The container rule and the private-item rule now apply to each.
       */
      const isManager = await resolveIsManager(this.db, workspaceId, userId)
      const inView = containerVisibilityFilter(this.db, userId, isManager)
      // A task's reach is its list's too (`found-24-sep/private-lists-skipped-by-task-reads`).
      const taskInReach = taskInReachFilter(this.db, workspaceId, userId, isManager)
      const listInView = listVisibilityFilter(userId, isManager)
      const taskInView = and(taskInReach, taskVisibilityFilter(this.db, userId, isManager))
      const [[wsRow], [roleRow], [counts], spaceRows, projectRows, openTasks, history, statusBreakdown] = await Promise.all([
        this.db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
        this.db
          .select({ role: workspaceMembers.role })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
          .limit(1),
        this.db
          .select({
            // The personal space and its container are nobody's space or project (`personal-list.ts`); one's own Personal List is a list of theirs.
            spaces: sql<number>`count(distinct case when not ${spaces.isPersonal} then ${spaces.id} end)::int`,
            projects: sql<number>`count(distinct case when not ${spaces.isPersonal} then ${projects.id} end)::int`,
            lists: sql<number>`count(distinct case when (${listInView ?? sql`true`}) then ${lists.id} end)::int`,
            openTasks: sql<number>`count(distinct case when ${tasks.statusCategory} <> 'closed' and ${tasks.isArchived} = false and (${taskInView ?? sql`true`}) then ${tasks.id} end)::int`,
          })
          .from(spaces)
          .leftJoin(projects, eq(projects.spaceId, spaces.id))
          .leftJoin(lists, eq(lists.projectId, projects.id))
          .leftJoin(tasks, eq(tasks.listId, lists.id))
          .where(and(eq(spaces.workspaceId, workspaceId), inView)),
        this.db
          .select({ id: spaces.id, name: spaces.name })
          .from(spaces)
          .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isPersonal, false), spaceVisibilityFilter(this.db, userId, isManager)))
          .orderBy(asc(spaces.name))
          .limit(20),
        this.db
          .select({ id: projects.id, name: projects.name, spaceId: projects.spaceId })
          .from(projects)
          .innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isPersonal, false), inView))
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
              inView,
              taskInReach,
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
              inView,
              taskInView,
              or(
                eq(tasks.createdById, userId),
                sql`exists (select 1 from ${taskAssignees} where ${taskAssignees.taskId} = ${tasks.id} and ${taskAssignees.userId} = ${userId})`,
              ),
            ),
          )
          .orderBy(desc(tasks.updatedAt))
          .limit(40),
        /*
         * §V2-S16 `20:10` — the real per-status counts.
         *
         * Best-effort on purpose: `buildWorkspaceContext` already falls back to
         * a workspace-ID stub on any failure, and a breakdown that throws must
         * not cost the model the rest of its grounding. `null` simply omits the
         * block, which is the honest degradation — a MISSING breakdown makes
         * the model say it cannot break the numbers down, while a zeroed one
         * would make it announce an empty workspace.
         */
        this.workspaceStatusBreakdown(workspaceId, userId).catch(() => null),
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
        statusBreakdown: statusBreakdown ?? undefined,
      })
    } catch {
      return `Workspace ID: ${workspaceId}`
    }
  }

  /**
   * §V2-S16 frame `20:10` — *"13 open tasks total: 11 To Do, 1 In Progress, 1
   * Complete"*, computed rather than inferred.
   *
   * ONE GROUP BY, not a count of the rows we happened to load. The old context
   * carried a single `open tasks` aggregate and fifteen of the caller's own
   * rows; anything derived from those fifteen would be a confident number about
   * the wrong population, which is indistinguishable from the right one on
   * screen. This counts EVERY non-archived task in the workspace that this
   * actor may see — the same visibility filter `loadCommandContext` uses, so a
   * member is never told a total that includes private work they cannot open.
   *
   * Read by `buildWorkspaceContext` (grounding the answer) and by
   * `GET /ai/project-status` (so the number can be checked against the
   * workspace, which is what frame `20:10`'s second step claims to do).
   */
  async workspaceStatusBreakdown(
    workspaceId: string,
    actorId: string,
    actorRole?: string | null,
  ): Promise<WorkspaceStatusBreakdown> {
    const isManager = actorId ? await resolveIsManager(this.db, workspaceId, actorId, actorRole) : false
    const rows = await this.db
      .select({
        status: tasks.status,
        statusCategory: tasks.statusCategory,
        count: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          eq(tasks.isArchived, false),
          // Both rules: this counted tasks in private spaces the actor is refused.
          taskInReachFilter(this.db, workspaceId, actorId, isManager),
          taskVisibilityFilter(this.db, actorId, isManager),
        ),
      )
      .groupBy(tasks.status, tasks.statusCategory)

    const byCategory = { open: 0, in_progress: 0, closed: 0 }
    let total = 0
    const byStatus = rows.map((r) => {
      const n = Number(r.count) || 0
      total += n
      const category = (r.statusCategory as StatusCategory) ?? 'open'
      if (category in byCategory) byCategory[category] += n
      return { status: r.status, statusCategory: category, count: n }
    })
    /*
     * Sorted here rather than in SQL, and by count THEN key. A breakdown whose
     * order changes between two reads of the same data reads as the data having
     * changed, and the panel compares these two lists.
     */
    byStatus.sort((a, b) => b.count - a.count || a.status.localeCompare(b.status))
    return { total, byCategory, byStatus }
  }

  /**
   * §V2-S16 frame `20:10` — what an inline `[[task:id]]` / `[[list:id]]` chip
   * in an answer resolves to.
   *
   * THE STATUS IS READ NOW, NOT QUOTED FROM THE ANSWER. The frame's chips each
   * carry the task's own status badge; an answer is a record of what was true
   * when it was written, so a badge copied out of the prose would be wrong the
   * moment anybody moved the task — and wrong in the most confident way, since
   * it sits inside a sentence. Every chip is hydrated from this read at render
   * time.
   *
   * Ids the caller may not see simply do not come back. The panel then renders
   * the reference as plain text, which is the honest answer: better an
   * unresolved reference than a chip claiming a title the reader has no access
   * to. "May not see" includes the container rule: only the private-item and
   * private-list rules applied, and a refused space's task and list came back
   * by name (measured on lane 1).
   */
  async resolveRefs(
    workspaceId: string,
    actorId: string,
    ids: { taskIds?: string[]; listIds?: string[] },
    actorRole?: string | null,
  ): Promise<{
    tasks: Array<{ id: string; title: string; status: string; statusCategory: string; listId: string; listName: string }>
    lists: Array<{
      id: string
      name: string
      path: string
      spaceId: string
      projectId: string
      views: string[]
    }>
  }> {
    const taskIds = uniqueUuids(ids.taskIds)
    const listIds = uniqueUuids(ids.listIds)
    if (!taskIds.length && !listIds.length) return { tasks: [], lists: [] }
    const isManager = actorId ? await resolveIsManager(this.db, workspaceId, actorId, actorRole) : false

    const [taskRows, listRows] = await Promise.all([
      taskIds.length
        ? this.db
            .select({
              id: tasks.id,
              title: tasks.title,
              status: tasks.status,
              statusCategory: tasks.statusCategory,
              listId: tasks.listId,
              listName: lists.name,
            })
            .from(tasks)
            .innerJoin(lists, eq(lists.id, tasks.listId))
            .innerJoin(projects, eq(projects.id, lists.projectId))
            .innerJoin(spaces, eq(spaces.id, projects.spaceId))
            .where(
              and(
                eq(spaces.workspaceId, workspaceId),
                inArray(tasks.id, taskIds),
                taskInReachFilter(this.db, workspaceId, actorId, isManager),
                taskVisibilityFilter(this.db, actorId, isManager),
              ),
            )
        : Promise.resolve([]),
      listIds.length
        ? this.db
            .select({
              id: lists.id,
              name: lists.name,
              projectId: lists.projectId,
              projectName: projects.name,
              spaceId: projects.spaceId,
              spaceName: spaces.name,
              viewConfig: spaces.viewConfig,
            })
            .from(lists)
            .innerJoin(projects, eq(projects.id, lists.projectId))
            .innerJoin(spaces, eq(spaces.id, projects.spaceId))
            .where(
              and(
                eq(spaces.workspaceId, workspaceId),
                inArray(lists.id, listIds),
                containerVisibilityFilter(this.db, actorId, isManager),
                listVisibilityFilter(actorId, isManager),
              ),
            )
        : Promise.resolve([]),
    ])

    return {
      tasks: taskRows.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        statusCategory: String(t.statusCategory ?? 'open'),
        listId: t.listId,
        listName: t.listName,
      })),
      lists: listRows.map((l) => ({
        id: l.id,
        name: l.name,
        // The path the container tools compose, so a chip made by the AI and a
        // chip resolved afterwards read identically.
        path: containerPath(l.spaceName, l.name),
        /*
         * §V2-S16 `18:48` — WHERE THE CHIP GOES.
         *
         * The frame's path chips are pressed. A chip is a link, and a link
         * needs the whole route: Rundesk addresses a list as
         * `/app/:workspaceId/:spaceId/:projectId/:listId`. Sending only the id
         * and the display path — which is all this returned before — left the
         * browser able to draw the chip and unable to open it, which is how a
         * label ends up pretending to be a control.
         */
        spaceId: l.spaceId,
        projectId: l.projectId,
        /*
         * And WHICH TABS EXIST THERE, live. A `[[view:…:board]]` chip written
         * into an answer last week must not still offer a Board that the space
         * has since turned off: the status badge on a task chip is read from
         * the database at render time for exactly this reason, and a view chip
         * is the same promise about a different fact.
         */
        views: enabledViewsFor(l.viewConfig, SPACE_VIEW_KEYS),
      })),
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
    await this.assertWithinRateLimit(ctx, new Date(), 'summarize')

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
      await this.recordFailure('summarize', 'claude-haiku-4-5', ctx, 'provider_error', message)
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
   * workspace, OF THE TASKS THE ASKER MAY OPEN, as the workload panel counts
   * them — a colleague's load in a list the asker is refused is not theirs to
   * read, as a number or otherwise. Returns undefined when the task has no
   * assignees so the deadline prompt omits the line entirely.
   */
  async buildTeamWorkloadSignal(taskId: string, reader: { id: string; role?: string | null }): Promise<string | undefined> {
    const assignees = await this.db
      .select({ userId: taskAssignees.userId, name: sql<string>`coalesce(${users.displayName}, ${users.email})` })
      .from(taskAssignees)
      .innerJoin(users, eq(users.id, taskAssignees.userId))
      .where(eq(taskAssignees.taskId, taskId))
    if (assignees.length === 0) return undefined

    const workspaceId = await this.resolveTaskWorkspaceId(taskId)
    if (!workspaceId) return undefined

    const ids = assignees.map((a) => a.userId)
    const readerSees = await this.readerTaskFilter(workspaceId, reader)
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
          readerSees,
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

  /*
   * §G02 — the thumbs under a palette answer.
   *
   * Keyed on the normalised question rather than on a message id, because a
   * palette answer is never persisted as a message. See the schema comment on
   * `ai_answer_feedback` for why that trade is the right way round.
   */
  private static normalizeQuestion(question: string): string {
    return question.trim().toLowerCase().slice(0, 500)
  }

  async getAnswerFeedback(
    workspaceId: string,
    userId: string,
    question: string,
  ): Promise<'up' | 'down' | null> {
    const q = AiService.normalizeQuestion(question)
    if (!q) return null
    const [row] = await this.db
      .select({ rating: aiAnswerFeedback.rating })
      .from(aiAnswerFeedback)
      .where(
        and(
          eq(aiAnswerFeedback.workspaceId, workspaceId),
          eq(aiAnswerFeedback.userId, userId),
          eq(aiAnswerFeedback.question, q),
        ),
      )
      .limit(1)
    return row?.rating === 'up' || row?.rating === 'down' ? row.rating : null
  }

  /**
   * Set, flip or clear. Pressing the thumb that is already lit clears it —
   * the same convention `chat-threads.controller.ts` uses, so the two feedback
   * controls in the product do not behave differently from each other.
   *
   * Returns the rating now in force, so the caller never has to guess what its
   * own click produced.
   */
  async setAnswerFeedback(
    workspaceId: string,
    userId: string,
    question: string,
    rating: 'up' | 'down' | null,
  ): Promise<{ feedback: 'up' | 'down' | null }> {
    const q = AiService.normalizeQuestion(question)
    if (!q) return { feedback: null }
    const current = await this.getAnswerFeedback(workspaceId, userId, q)
    // No opinion is the absence of a row, not a third value, so clearing is a
    // delete — otherwise "unrated" and "rated null" become two states that read
    // the same and count differently.
    const next = rating === null || rating === current ? null : rating
    const scope = and(
      eq(aiAnswerFeedback.workspaceId, workspaceId),
      eq(aiAnswerFeedback.userId, userId),
      eq(aiAnswerFeedback.question, q),
    )
    if (next === null) {
      await this.db.delete(aiAnswerFeedback).where(scope)
      return { feedback: null }
    }
    await this.db
      .insert(aiAnswerFeedback)
      .values({ workspaceId, userId, question: q, rating: next })
      .onConflictDoUpdate({
        target: [aiAnswerFeedback.workspaceId, aiAnswerFeedback.userId, aiAnswerFeedback.question],
        set: { rating: next, updatedAt: new Date() },
      })
    return { feedback: next }
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
    const meetingIds: string[] = []
    for (const h of hits) {
      const { type, rawId } = splitSearchId(h.id)
      if (type === 'task') taskIds.push(rawId)
      else if (type === 'doc') docIds.push(rawId)
      else if (type === 'comment') commentIds.push(rawId)
      else if (type === 'attachment') attachmentIds.push(rawId)
      else if (type === 'meeting') meetingIds.push(rawId)
    }
    const [taskRows, docRows, commentRows, meetingRows] = await Promise.all([
      taskIds.length
        ? this.db.select({ id: tasks.id, text: tasks.description }).from(tasks).where(inArray(tasks.id, taskIds))
        : Promise.resolve([] as Array<{ id: string; text: string | null }>),
      docIds.length
        ? this.db.select({ id: docs.id, text: docs.plaintext }).from(docs).where(inArray(docs.id, docIds))
        : Promise.resolve([] as Array<{ id: string; text: string | null }>),
      commentIds.length
        ? this.db.select({ id: taskComments.id, text: taskComments.body }).from(taskComments).where(inArray(taskComments.id, commentIds))
        : Promise.resolve([] as Array<{ id: string; text: string | null }>),
      /*
       * §G14-15 — the notes, which are the whole point of citing a meeting.
       *
       * Without this branch a meeting reaches the model as a bare title, and a
       * heading like "Weekly sync" grounds nothing: the answer would cite a
       * meeting it had not actually read.
       */
      meetingIds.length
        ? this.db.select({ id: meetings.id, text: meetings.notes }).from(meetings).where(inArray(meetings.id, meetingIds))
        : Promise.resolve([] as Array<{ id: string; text: string | null }>),
    ])
    const byId = new Map<string, string>()
    for (const r of [...taskRows, ...docRows, ...commentRows, ...meetingRows]) byId.set(r.id, r.text ?? '')

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
          // Not a link: its key is the URL, and there is no object to read.
          .filter((a) => isExtractableAttachment(a.contentType) && !isLinkAttachmentKey(a.storageKey))
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

    /*
     * The task a hit hangs off must be one the caller may open: the shared
     * rules, not a copy. This stated "a private space needs membership, a
     * private project needs membership" in its own words and stopped there —
     * no private list, no private task, no space admin's reach into a private
     * project — so a member refused a private list and a private task was cited
     * the list's task and a comment on the task (measured;
     * `found-24-sep/ai-knowledge-filter-copies-the-container-rule`).
     * `taskInReachFilter` is the container rule with the list's own privacy;
     * `taskVisibilityFilter` the private-task rule. Past the manager return, so
     * neither is a manager's.
     */
    const taskOpen = and(taskInReachFilter(this.db, workspaceId, userId, false), taskVisibilityFilter(this.db, userId, false))

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
                taskOpen,
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
            .where(and(eq(spaces.workspaceId, workspaceId), inArray(taskComments.id, commentIds), taskOpen))
        : Promise.resolve([] as Array<{ id: string }>),
      docIds.length
        ? (async () => {
            // The doc rule itself (`doc-access.ts`), not a space-only copy of
            // it: that copy passed a page with no space of its own under a
            // private doc, and the answer cited it to a member refused the doc
            // (measured on lane 1). Past the manager return, so not a manager.
            const hidden = new Set(await hiddenDocIds(this.db, workspaceId, userId, false))
            const inWorkspace = await this.db
              .select({ id: docs.id })
              .from(docs)
              .where(and(eq(docs.workspaceId, workspaceId), inArray(docs.id, docIds)))
            return inWorkspace.filter((d) => !hidden.has(d.id))
          })()
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
            .where(and(eq(spaces.workspaceId, workspaceId), inArray(taskAttachments.id, attachmentIds), taskOpen))
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
      /*
       * §G14-15 — a meeting needs workspace membership and nothing else, and
       * that is already true of every row here: the candidate set is selected
       * `where workspaceId = ...`, and this whole function is only reached
       * after `assertWorkspaceMember`.
       *
       * Stated rather than left to the fall-through below. That default is
       * documented as being for types SearchService has already scoped, which
       * meetings are not — they come from the embeddings table. A branch that
       * happens to be right for a reason its comment does not describe is one
       * refactor from being wrong.
       */
      if (type === 'meeting') return true
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

  /**
   * §V2-S17/S22 frames `16:32` / `21:15` — the four starter cards, for THIS
   * caller, on THIS surface, right now.
   *
   * THREE COUNTS AND A SURFACE, and every one of them is read here rather than
   * inferred in the browser. The two the cards actually turn on are personal —
   * *your* overdue work and *your* open work — and the browser cannot compute
   * either without shipping it the workspace's task table.
   *
   * Visibility is `taskVisibilityFilter`, the same filter the ref resolver and
   * the command context use, so a private task you may not see cannot put
   * "Find blockers" on your screen. The assigned counts are additionally joined
   * through `task_assignees`, so they are your tasks and not the workspace's.
   *
   * `ne(statusCategory, 'closed')` rather than a status-key list: a workspace
   * can rename "Done" to anything, and a count keyed on the word would start
   * reporting finished work as open the day somebody did.
   */
  async starterCardsFor(
    workspaceId: string,
    userId: string,
    surface: StarterSurface,
    actorRole?: string | null,
  ): Promise<{ facts: StarterFacts; cards: StarterCard[]; contextual: number }> {
    const isManager = await resolveIsManager(this.db, workspaceId, userId, actorRole)
    const visible = taskVisibilityFilter(this.db, userId, isManager)
    const inWorkspace = and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false), visible)
    // `overdueBefore` rather than a local midnight: `suggestAssignee` counts
    // late work too, and two definitions a day apart is how the starter card
    // and the assignee reason start disagreeing about the same person.
    const todayStart = overdueBefore()

    const mine = (extra?: SQL) =>
      this.db
        .select({ count: sql<number>`count(distinct ${tasks.id})::int` })
        .from(tasks)
        .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(inWorkspace, eq(taskAssignees.userId, userId), ne(tasks.statusCategory, 'closed'), extra))

    const [overdueRows, assignedRows, openRows] = await Promise.all([
      mine(lt(tasks.dueDate, todayStart)),
      mine(),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(inWorkspace, ne(tasks.statusCategory, 'closed'))),
    ])

    const facts: StarterFacts = {
      surface,
      overdue: overdueRows[0]?.count ?? 0,
      assignedOpen: assignedRows[0]?.count ?? 0,
      workspaceOpen: openRows[0]?.count ?? 0,
    }
    const cards = starterCards(facts)
    // Returned beside the cards, not computed from them in the browser: the
    // panel must be able to say "these four are a floor" without re-deriving
    // the rule that decided so.
    return { facts, cards, contextual: contextualCardCount(cards) }
  }

  /**
   * §V2-S17 frame `15:50` — **"⚡ Assign with AI"**: who should take this.
   *
   * THE EVIDENCE, READ HERE. Three numbers per candidate, all from Postgres,
   * all about the same workspace:
   *
   *   · `openTasks` — their open assigned load, from `collectWorkloadLoads`,
   *     the SAME read the §7.12 workload panel uses. Not a second count: two
   *     definitions of "how much is Ana carrying" is how the balance panel and
   *     this feature end up recommending opposite things on the same day.
   *   · `inList`   — their open tasks in THIS task's list. Context.
   *   · `overdue`  — how much of their load is already late.
   *
   * WHO IS A CANDIDATE. Non-guest members of the workspace who can SEE the
   * task (`taskVisibilityFilter`, as everywhere else), minus whoever is already
   * on it — there is nothing to choose about someone who already has it.
   *
   * WHAT THIS DOES NOT DO: assign. It returns a suggestion and the argument for
   * it. The write stays where it was, behind `assign_task` and the confirm
   * step, because `[18:09]` is about being able to see what it is doing — and a
   * tool that both chose and assigned would be one call between a question and
   * somebody else's workload changing.
   */
  async suggestAssignee(taskId: string, actorId: string): Promise<AssignResult> {
    if (!isUuid(taskId)) return refuseAssign('unknown_task')
    const [row] = await this.db
      .select({
        id: tasks.id,
        listId: tasks.listId,
        workspaceId: spaces.workspaceId,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(tasks.id, taskId), eq(tasks.isArchived, false)))
      .limit(1)
    if (!row) return refuseAssign('unknown_task')

    const actorRole = await this.memberRole(row.workspaceId, actorId)
    if (!actorRole || actorRole === 'guest') return refuseAssign('no_permission')
    // Nor for a task its asker may not open: the task routes' read rule, which
    // a member refused its private list failed and was answered anyway
    // (`ai-task-paths-skip-the-read-rule`).
    if (!(await readableTask(this.db, row.workspaceId, taskId, { id: actorId }))) return refuseAssign('no_permission')
    // Every count below is of the tasks the ASKER may open, as the workload
    // panel's are: a colleague's load in a space the asker is refused is not
    // theirs to read, as a number or otherwise.
    const actorSees = await this.readerTaskFilter(row.workspaceId, { id: actorId })

    const [members, loads, alreadyOn, inListRows, overdueRows] = await Promise.all([
      this.db
        .select({
          userId: workspaceMembers.userId,
          role: workspaceMembers.role,
          email: users.email,
          displayName: users.displayName,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(eq(workspaceMembers.workspaceId, row.workspaceId)),
      this.collectWorkloadLoads(row.workspaceId, { id: actorId }),
      this.db.select({ userId: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, taskId)),
      this.db
        .select({ userId: taskAssignees.userId, count: sql<number>`count(distinct ${tasks.id})::int` })
        .from(taskAssignees)
        .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
        .where(and(eq(tasks.listId, row.listId), eq(tasks.isArchived, false), ne(tasks.statusCategory, 'closed'), actorSees))
        .groupBy(taskAssignees.userId),
      this.db
        .select({ userId: taskAssignees.userId, count: sql<number>`count(distinct ${tasks.id})::int` })
        .from(taskAssignees)
        .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(
          and(
            eq(spaces.workspaceId, row.workspaceId),
            eq(tasks.isArchived, false),
            ne(tasks.statusCategory, 'closed'),
            // The same boundary the starter cards use. See `overdueBefore`.
            lt(tasks.dueDate, overdueBefore()),
            actorSees,
          ),
        )
        .groupBy(taskAssignees.userId),
    ])

    const openBy = new Map(loads.map((l) => [l.userId, l.open]))
    const inListBy = new Map(inListRows.map((r) => [r.userId, r.count]))
    const overdueBy = new Map(overdueRows.map((r) => [r.userId, r.count]))
    const taken = new Set(alreadyOn.map((a) => a.userId))

    /*
     * CAN THEY SEE IT? Asked per candidate against the real filter rather than
     * assumed from membership: a private space's task must not be suggested to
     * somebody who cannot open it, and "is a member" is not the same question.
     * `taskVisibilityFilter` is the filter the ref resolver and the command
     * context use, so there is one answer to it in this product.
     *
     * IN PARALLEL, because it is two queries per member and a two-hundred
     * person workspace would otherwise serialise four hundred round trips
     * behind one menu press. Reimplementing the rule inline to make it one
     * query would be a second copy of it, which is the trade this refuses.
     */
    const eligible = members.filter(
      // A guest can be a workspace member and must not be handed work, the
      // same rule `createContainer` and `executeOne` already apply.
      (m) => m.role !== 'guest' && !taken.has(m.userId),
    )
    const visibility = await Promise.all(
      eligible.map(async (m) => {
        const isManager = await resolveIsManager(this.db, row.workspaceId, m.userId, m.role)
        const [visible] = await this.db
          .select({ id: tasks.id })
          .from(tasks)
          .innerJoin(lists, eq(lists.id, tasks.listId))
          .innerJoin(projects, eq(projects.id, lists.projectId))
          .innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .where(and(eq(tasks.id, taskId), taskVisibilityFilter(this.db, m.userId, isManager)))
          .limit(1)
        return !!visible
      }),
    )
    const candidates: AssigneeCandidate[] = eligible
      .filter((_, i) => visibility[i])
      .map((m) => ({
        userId: m.userId,
        email: m.email,
        displayName: m.displayName ?? null,
        openTasks: openBy.get(m.userId) ?? 0,
        inList: inListBy.get(m.userId) ?? 0,
        overdue: overdueBy.get(m.userId) ?? 0,
      }))

    if (candidates.length === 0) {
      // Told apart on purpose: "everyone is already on it" and "nobody can be"
      // are different answers, and a single "no suggestion" would hide which.
      return refuseAssign(taken.size > 0 ? 'already_assigned' : 'no_candidates')
    }

    /*
     * The capacity gate's source: the product's existing definition of
     * overloaded, over the WHOLE team's loads rather than only the candidates',
     * because "above the team average" means the team.
     */
    const overloaded = new Set(
      findOverloadedAssignees(loads.map((l) => ({ userId: l.userId, name: l.name, open: l.open }))).map(
        (o) => o.userId,
      ),
    )
    return rankAssignees(candidates, taskId, overloaded)
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
   * A task by id is read for its reader only as they may open it: the task
   * routes' own rule (`readableTask`) — the container, a guest's reach, a
   * private list or task. ClickUp's Brain surfaces only what its asker may see.
   *
   * It used to ask only that the reader belonged to the task's WORKSPACE, so a
   * guest with nothing shared, and a member refused the task's private list,
   * had its title, description, activity and comments sent to the model for
   * them (`ai-task-paths-skip-the-read-rule`). The routes ask it BEFORE they ask
   * whether a model is configured, so a refusal reads the same either way.
   */
  async assertTaskReadable(taskId: string, reader: { id: string; role?: string | null }): Promise<string> {
    const workspaceId = isUuid(taskId) ? await this.resolveTaskWorkspaceId(taskId) : null
    if (!workspaceId) throw new NotFoundException('Task not found')
    if (!(await readableTask(this.db, workspaceId, taskId, reader))) {
      throw new ForbiddenException('You do not have access to this task')
    }
    // The task's workspace, for a caller that also names one: a turn about a
    // task is answered inside that task's workspace or not at all.
    return workspaceId
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
    const [listRows, memberRows, taskRows, spaceRows] = await Promise.all([
      this.db
        .select({ id: lists.id, name: lists.name, projectName: projects.name, spaceName: spaces.name })
        .from(lists)
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(
          and(
            eq(spaces.workspaceId, workspaceId),
            eq(lists.isArchived, false),
            containerVisibilityFilter(this.db, actorId, isManager),
            listVisibilityFilter(actorId, isManager),
          ),
        )
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
        .where(
          and(
            eq(spaces.workspaceId, workspaceId),
            eq(tasks.isArchived, false),
            taskInReachFilter(this.db, workspaceId, actorId, isManager),
            taskVisibilityFilter(this.db, actorId, isManager),
          ),
        )
        .orderBy(asc(tasks.dueDate))
        .limit(300),
      /*
       * §V2-S16 `[17:44]` — the spaces a container may be created in.
       *
       * `checkContainerAccess` in the executor is still what refuses a WRITE
       * into a space. But this list goes into the prompt by name, and it named
       * private spaces to members refused them (measured on lane 1), so the
       * read rule applies here too: a space the caller cannot open is not one
       * the assistant can resolve, which is the same answer as not existing.
       */
      this.db
        .select({ id: spaces.id, name: spaces.name, visibility: spaces.visibility })
        .from(spaces)
        // Nothing but tasks is made in the personal space (`assertCanCreateInSpace`).
        .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isPersonal, false), spaceVisibilityFilter(this.db, actorId, isManager)))
        .orderBy(asc(spaces.name))
        .limit(100),
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
      spaces: spaceRows.map((s) => ({ id: s.id, name: s.name, visibility: s.visibility as string | null })),
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

  /**
   * §15 Skills Miner — "Turn repeat work into skills / Scan your tasks, docs,
   * and chats to surface workflows worth saving" (frame `285_1743`).
   *
   * The scans are real and their counts are reported, because the card's whole
   * claim is that it read YOUR work. A miner that asked a model to imagine
   * plausible skills would produce something that looked identical and meant
   * nothing, and nobody could tell from the outside which they had.
   *
   * Nothing is written. Each suggestion is an ordinary proposal, approved on
   * the same gate as one you asked for by name.
   */
  async mineSkills(
    workspaceId: string,
    userId: string,
    ctx: AiCtx = {},
    onStep?: (step: ProposalStep) => void,
  ): Promise<{ skills: MinedSkill[]; message: string }> {
    const steps: ProposalStep[] = []
    const step = (v: ProposalStep) => {
      steps.push(v)
      onStep?.(v)
    }

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const [myTasks, myDocs, existing] = await Promise.all([
      // Tasks this person created — what they repeatedly set up is the
      // strongest signal of a workflow they run.
      this.db
        .select({ title: tasks.title })
        .from(tasks)
        .where(and(eq(tasks.createdById, userId), gte(tasks.createdAt, since)))
        .orderBy(desc(tasks.createdAt))
        .limit(120),
      this.db
        .select({ title: docs.title })
        .from(docs)
        .where(and(eq(docs.workspaceId, workspaceId), eq(docs.createdById, userId)))
        .orderBy(desc(docs.createdAt))
        .limit(60),
      this.db
        .select({ name: skills.name })
        .from(skills)
        .where(and(eq(skills.workspaceId, workspaceId), eq(skills.createdById, userId)))
        .limit(20),
    ])

    step({ label: 'Reading the tasks you set up', finding: `${myTasks.length} in the last 90 days` })
    step({ label: 'Reading the docs you wrote', finding: `${myDocs.length}` })
    const owned = existing.map((r) => r.name)
    step({
      label: 'Checking what you have already turned into a skill',
      finding: owned.length ? owned.join(', ') : 'nothing yet',
    })

    // Too little to find repetition in. Saying so beats asking a model to find
    // a pattern in four task titles and dressing up whatever it returns.
    if (myTasks.length + myDocs.length < 8 || !this.isAvailable()) {
      return { skills: [], message: noPatternsFound(steps) }
    }

    const response = await this.complete('skill.mine', ctx, {
      model: 'claude-sonnet-4-6',
      max_tokens: 2400,
      system: `You find REPEATED workflows in someone's real work and turn them into reusable skills for the Rundesk project management app.

A skill is a named playbook — a persona plus instructions — that shapes how the
assistant answers when someone invokes it. It does not act on its own, so never
write instructions that assume it can.

Only propose a skill for a pattern you can actually SEE repeated in the lines
below. Quote the lines that show it in "evidence" — exactly as they appear, not
paraphrased. If nothing is repeated often enough to be worth saving, return an
empty array; that is a good answer, not a failure. Never propose something they
already have.

Reply with ONLY a JSON array of at most 5 objects:
[{
  "name": "Title Case, like a product a person would spot in a list",
  "description": "one line",
  "instructions": "the playbook, second person, addressed to the assistant",
  "memories": ["what this pattern shows about how they work"],
  "rationale": "the repetition you saw, in one or two sentences",
  "evidence": ["the actual lines that show it, verbatim"],
  "followUps": ["things THE USER would say next, in their voice, never questions to them"]
}]`,
      messages: [
        {
          role: 'user',
          content: `Tasks they created (newest first):
${myTasks.map((t) => `- ${t.title}`).join('\n') || '(none)'}

Docs they wrote:
${myDocs.map((d) => `- ${d.title}`).join('\n') || '(none)'}

Skills they already have: ${owned.length ? owned.join(', ') : 'none'}.`,
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const mined = parseMinedSkills(text, steps)
    return {
      skills: mined,
      message: mined.length
        ? `I read ${myTasks.length} task(s) and ${myDocs.length} doc(s) you made, and found ${mined.length} workflow(s) worth saving.`
        : noPatternsFound(steps),
    }
  }

  /**
   * §15 — name a chat from what it is about, frames `296_1817` → `297_1820`.
   *
   * Returns '' when no model is configured rather than inventing something:
   * the caller has a deterministic fallback built from the first question,
   * which is a better name than anything guessed here.
   */
  async titleForChat(
    messages: Array<{ role: string; content: string }>,
    ctx: AiCtx = {},
  ): Promise<string> {
    if (!this.isAvailable() || messages.length === 0) return ''
    const transcript = messages
      .slice(0, 6)
      .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
      .join('\n')
    const response = await this.complete('chat.title', ctx, {
      // The cheap model on purpose: this is a three-word heading, and running
      // it on the expensive one would cost real money per conversation for no
      // difference anyone could see.
      model: 'claude-haiku-4-5',
      max_tokens: 40,
      system:
        'Name this conversation in 2-5 words, like a heading in a sidebar. ' +
        'Reply with ONLY the title — no quotes, no punctuation at the end, no explanation.',
      messages: [{ role: 'user', content: transcript }],
    })
    return response.content[0]?.type === 'text' ? response.content[0].text : ''
  }

  /**
   * §2.8 — the meetings ask-box: "Get instant answers and insights from your
   * meetings" with her four starter chips (frame `310`).
   *
   * Grounded in the meetings themselves, passed in by the caller rather than
   * read here — MeetingsService owns the membership check, and doing the read
   * there keeps one access rule instead of two that can drift.
   *
   * Refuses rather than improvises when there is nothing to read: an answer
   * about meetings you have not had is worse than being told there are none.
   */
  async askAboutMeetings(
    question: string,
    meetingsContext: Array<{
      title: string
      startsAt: Date | null
      notes: string | null
      attendees: string[]
    }>,
    ctx: AiCtx = {},
  ): Promise<{ answer: string; grounded: boolean }> {
    if (meetingsContext.length === 0) {
      return {
        answer:
          'There are no meetings recorded here yet, so there is nothing for me to read. ' +
          'Record one from the AI panel’s Meeting notes tab and ask me again.',
        grounded: false,
      }
    }
    if (!this.isAvailable()) {
      return {
        answer: `I can see ${meetingsContext.length} meeting(s), but no model is configured on this instance, so I cannot read them for you.`,
        grounded: false,
      }
    }

    const transcript = meetingsContext
      .map((m) => {
        const when = m.startsAt ? new Date(m.startsAt).toISOString().split('T')[0] : 'no date'
        const who = m.attendees.length ? ` — with ${m.attendees.join(', ')}` : ''
        return `## ${m.title} (${when})${who}\n${m.notes ?? '(no notes were kept)'}`
      })
      .join('\n\n')

    const response = await this.complete('meetings.ask', ctx, {
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `You answer questions about someone's meetings, using ONLY the records below.

Cite meetings by their title and date so the answer can be checked. If the
records do not contain the answer, say which meetings you looked at and that
they do not cover it — do not fill the gap. Many meetings here will have no
notes kept; say so rather than inferring what was discussed from the title.

Today is ${new Date().toISOString().split('T')[0]}.`,
      messages: [{ role: 'user', content: `${question}\n\n---\n\n${transcript}` }],
    })
    const answer = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return { answer, grounded: true }
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
    // §V2-S16 — so "on rundesk space" can be resolved to an id rather than
    // guessed at. The planner refuses an unknown or ambiguous name outright.
    const spaceCatalog = (planCtx.spaces ?? [])
      .slice(0, 60)
      .map((s) => `- ${s.id}: ${s.name}`)
      .join('\n')
    const systemPrompt = `You are Rundesk's command assistant. Translate the user's natural-language request into tool calls.
Today's date is ${planCtx.today}.
Use search_tasks (READ-ONLY) to locate task ids before proposing changes; reference tasks by their id.
For any change (create_task / set_task_status / reschedule_task / assign_task / bulk_reschedule / create_list / create_folder) call the matching tool. Changes are PREVIEWED for the user to confirm and are NOT executed until they confirm — do not claim you have already made a change.
When creating a task, pick a listId from "Available lists". Resolve people by their email.
When creating a list or a folder, name the space with spaceName or a spaceId from "Available spaces". If you cannot tell which space is meant, say so instead of choosing one.

Workspace context:
${workspaceContext}

Available lists (id: path):
${listCatalog || '(none)'}

Available spaces (id: name):
${spaceCatalog || '(none)'}`

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
          // §V2-S16 — the container actions carry no task ids, so this is read
          // off the variants that have one rather than off every PlanAction.
          affectedTaskIds: 'affectedTaskIds' in action ? action.affectedTaskIds : undefined,
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
      /*
       * §V2-S16 `[18:45]`→`[18:48]` — the container, written.
       *
       * Delegated to `createContainer` so the `/ai/command/execute` path and
       * the chat surface's inline tool call go through ONE gate. Two doors into
       * one mutation is how a permission check ends up on one of them.
       */
      case 'create_list':
      case 'create_folder': {
        const kind = action.tool === 'create_list' ? 'list' : 'folder'
        const result = await this.createContainer(
          kind,
          action.tool === 'create_list'
            ? { ...action.args, kind: 'list' as const }
            : { ...action.args, kind: 'folder' as const },
          userId,
        )
        if (!result.ok) {
          return {
            tool: action.tool,
            humanLabel: action.humanLabel,
            status: 'skipped',
            reason: result.reason,
            message: result.message,
          }
        }
        return {
          tool: action.tool,
          humanLabel: action.humanLabel,
          status: 'succeeded',
          container: {
            kind: result.kind,
            id: result.id,
            name: result.name,
            path: result.path,
            spaceId: result.spaceId,
          },
        }
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

  // ─── §V2-S16 the AI creates a container ───────────────────────────────────

  /**
   * THE ONE GATE, and the only place a container the AI made is written.
   *
   * This is the row the audit calls "the facade with a model in front of it":
   * a tool that reports success without writing anything leaves the transcript
   * of a conversation standing as evidence that it worked, and a person finds
   * out days later. So every branch below either returns an id that came back
   * from the database, or refuses with a code.
   *
   * PERMISSION IS CHECKED EXACTLY AS THE REST ROUTE CHECKS IT, in the same
   * order, because "the AI can do what you can do" is only true if the two
   * paths agree:
   *
   *   · `POST /lists`                 — JwtAuthGuard + ResourceMemberGuard, i.e.
   *     workspace membership and, for a private space, container membership.
   *   · `POST /spaces/:id/folders`    — the same, PLUS PermissionsGuard with
   *     `space.create`.
   *
   * The membership check also refuses a `guest`, matching `create_task` above:
   * a guest can be a workspace member and must not be able to make containers.
   *
   * The write itself goes through `ListsService` / `FoldersService` rather than
   * an insert here. For a list that is load-bearing rather than tidy:
   * `createList` calls `seedListStatuses`, and a list with no status pipeline
   * accepts `status = 'done'` while keeping `status_category = 'open'` forever.
   */
  private async createContainer(
    kind: 'list' | 'folder',
    args:
      | { kind: 'list'; spaceId: string; name: string; description?: string; visibility?: 'public' | 'private' }
      | { kind: 'folder'; spaceId: string; name: string; color?: string },
    actorId: string,
  ): Promise<ContainerToolResult> {
    const name = toolString(args.name)
    if (!name) return refuse(kind, 'missing_name')
    if (!isUuid(args.spaceId)) return refuse(kind, 'unknown_space')

    const [space] = await this.db
      .select({
        id: spaces.id,
        name: spaces.name,
        visibility: spaces.visibility,
        workspaceId: spaces.workspaceId,
        viewConfig: spaces.viewConfig,
      })
      .from(spaces)
      .where(eq(spaces.id, args.spaceId))
      .limit(1)
    if (!space) return refuse(kind, 'unknown_space')

    const role = await this.memberRole(space.workspaceId, actorId)
    if (!role || role === 'guest') return refuse(kind, 'no_permission')

    // A private space needs space membership, exactly as ResourceMemberGuard
    // enforces it for the REST route. Managers pass, as they do there.
    const reachable = await checkContainerAccess(
      this.db,
      { spaceId: space.id, spaceVisibility: space.visibility as string | null },
      { userId: actorId, workspaceRole: role },
    )
    if (!reachable) return refuse(kind, 'no_permission')

    if (kind === 'folder') {
      /*
       * `space.create`, the permission the folder route requires and the list
       * route does not. Asked of CustomRolesService so a custom role that was
       * granted or denied it is honoured — reimplementing the legacy-role
       * cascade here would be a second copy of the rule, and the second copy is
       * the one that drifts.
       */
      if (!this.folders || !this.roles) return refuse(kind, 'unavailable')
      const resolution = await this.roles.resolveForUser(space.workspaceId, actorId)
      if (!resolution || !resolution.permissions.includes('space.create')) {
        return refuse(kind, 'no_permission')
      }
      const color = args.kind === 'folder' ? args.color : undefined
      let row: { id: string; name: string } | undefined
      try {
        row = await this.folders.create(space.id, { name, color }, actorId)
      } catch (err) {
        // A folder name is unique per space, same as a list name is per project.
        // A clash is a refusal a person can act on, not an error to swallow.
        if (err instanceof ConflictException) return refuse(kind, 'name_taken')
        throw err
      }
      if (!row?.id) return refuse(kind, 'unavailable')
      return {
        ok: true,
        kind: 'folder',
        id: row.id,
        name: row.name ?? name,
        spaceId: space.id,
        spaceName: space.name,
        path: containerPath(space.name, row.name ?? name),
        statuses: [],
        // A folder holds projects, not tasks: there is no task view to offer.
        views: [],
      }
    }

    if (!this.lists) return refuse(kind, 'unavailable')
    const projectId = await this.lists.defaultContainerForSpace(space.id, actorId)
    let created: { id: string; name: string } | undefined
    try {
      const row = await this.lists.createList(
        projectId,
        {
          name,
          description: args.kind === 'list' ? args.description : undefined,
          visibility: args.kind === 'list' && args.visibility === 'private' ? 'private' : 'public',
        },
        actorId,
      )
      created = row ? { id: row.id, name: row.name } : undefined
    } catch (err) {
      // §V2-S11 `08:50` — "List name taken" is a 409 from the service, and it
      // is a refusal a person can act on, not an error to swallow.
      if (err instanceof ConflictException) return refuse(kind, 'name_taken')
      throw err
    }
    if (!created?.id) return refuse(kind, 'unavailable')

    /*
     * READ THE PIPELINE BACK. `describeContainerResult` says "with standard
     * task statuses" and that sentence goes to the person, so it has to be a
     * fact about this row rather than a fact about what `createList` usually
     * does. An empty array makes the sentence say so instead.
     */
    const statusRows = await this.db
      .select({ key: listStatuses.key })
      .from(listStatuses)
      .where(eq(listStatuses.listId, created.id))
      .orderBy(asc(listStatuses.position))
    return {
      ok: true,
      kind: 'list',
      id: created.id,
      name: created.name,
      spaceId: space.id,
      spaceName: space.name,
      path: containerPath(space.name, created.name),
      statuses: statusRows.map((s) => s.key),
      /*
       * READ THE VIEWS BACK TOO, from this space's own config. The sentence
       * offers "use the Board to manage work by status", and a space that
       * disabled Board does not have one — the offer would open a tab that is
       * not there. Same discipline as the statuses above: the sentence states
       * a fact about THIS row, not about what a list usually has.
       */
      views: enabledViewsFor(space.viewConfig, SPACE_VIEW_KEYS),
    }
  }

  /**
   * §V2-S16 `[18:45]` — one container tool call from the CHAT surface, resolved
   * and executed during the turn.
   *
   * The difference from `/ai/command` is deliberate and is the frames': there
   * is no preview here. `[18:09]` — *"aap ko pata bhi rahega ke main kya kar
   * rahi hoon"* — the accountability is the step log, which names each action
   * as it happens, not a confirm button. So this must never be reachable from a
   * surface whose steps are not shown.
   *
   * Space resolution is the PURE function the planner uses, against the same
   * catalog, so "which space did they mean" has one answer in this product.
   */
  async runContainerTool(
    name: string,
    input: Record<string, unknown>,
    actor: { workspaceId: string; userId: string },
    spaceCatalog?: ContainerSpace[],
  ): Promise<ContainerToolResult> {
    const kind = name === 'create_list' ? 'list' : 'folder'
    if (!isContainerTool(name)) return refuse(kind, 'unavailable')
    const containerName = toolString(input.name)
    if (!containerName) return refuse(kind, 'missing_name')

    const catalog = spaceCatalog ?? (await this.loadCommandContext(actor.workspaceId, actor.userId)).spaces ?? []
    const resolved = resolveContainerSpace(input, catalog)
    if ('refusal' in resolved) return refuse(kind, resolved.refusal)

    try {
      return await this.createContainer(
        kind,
        kind === 'list'
          ? {
              kind: 'list',
              spaceId: resolved.space.id,
              name: containerName,
              description: toolString(input.description) || undefined,
              visibility: input.visibility === 'private' ? 'private' : 'public',
            }
          : {
              kind: 'folder',
              spaceId: resolved.space.id,
              name: containerName,
              color: toolString(input.color) || undefined,
            },
        actor.userId,
      )
    } catch (err) {
      /*
       * A throw here would abort the stream mid-answer and leave the person
       * with neither a container nor a reason. Turned into a refusal instead —
       * and into `no_permission` specifically when the services said so, since
       * that is the one a person can act on.
       */
      if (err instanceof ForbiddenException) return refuse(kind, 'no_permission')
      if (err instanceof NotFoundException) return refuse(kind, 'unknown_space')
      if (err instanceof ConflictException) return refuse(kind, 'name_taken')
      return refuse(kind, 'unavailable')
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

  /**
   * §G05 [05:40] — "✦ Get StandUp", written up.
   *
   * The counterpart to generateBriefing, and deliberately not the same prompt.
   * A briefing is addressed TO you about your own day and can be warm about
   * it; a standup is read BY somebody else about a third person's week, quite
   * often their manager, so the register that suits one is wrong for the other.
   * Hence the third person and the flat tone: this describes work, it does not
   * appraise the person doing it.
   *
   * The model is given the buckets and nothing else, and is told not to add to
   * them. A standup that invents a task is worse than no standup — the reader
   * has no way to check it, and the person it is about is not in the room.
   */
  async generateStandup(data: StandupData, ctx: AiCtx = {}): Promise<string> {
    const fallback = formatStandupFallback(data)
    if (!this.isAvailable()) return fallback
    try {
      const titles = (rows: StandupData['done']) => rows.slice(0, 8).map((r) => r.title).join('; ') || 'none'
      const lines = [
        `Person: ${data.displayName || 'this teammate'}`,
        `Window: the last ${data.days} day(s)`,
        `Completed (${data.done.length}): ${titles(data.done)}`,
        `In progress (${data.active.length}): ${titles(data.active)}`,
        `Overdue (${data.overdue.length}): ${titles(data.overdue)}`,
        `Blocked by unfinished work (${data.blocked.length}): ${titles(data.blocked)}`,
      ].join('\n')
      const response = await this.complete('people.standup', ctx, {
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        system:
          "You are Rundesk's standup writer. In 2-4 plain-text sentences, summarise what this person has been working on for a colleague reading their profile. " +
          'Write in the third person and use their first name. Lead with completed work, then work in progress, then anything overdue or blocked. ' +
          'Describe the work, never appraise the person, and never speculate about why something is late. ' +
          'Use only the tasks listed — do not invent any, and do not pad the summary when a bucket is empty.',
        messages: [{ role: 'user', content: `Here is their work:\n${lines}` }],
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
    if (!isManagerRole(role)) {
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
    reader: { id: string; role?: string | null },
  ): Promise<{ source: 'ai' | 'heuristic'; suggestions: TaskSuggestion[]; basis: string }> {
    const target =
      (input.projectName ?? '').trim() || (await this.resolveProjectName(input.workspaceId, input.projectId, reader)) || 'this project'
    const candidates = await this.collectCandidateProjects(input.workspaceId, input.projectId, reader)
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

  /** The project's name, when it is one of this workspace's that the reader may open. */
  private async resolveProjectName(
    workspaceId: string,
    projectId: string | undefined,
    reader: { id: string; role?: string | null },
  ): Promise<string | null> {
    if (!projectId || !isUuid(projectId)) return null
    const isManager = await resolveIsManager(this.db, workspaceId, reader.id, reader.role)
    const [row] = await this.db
      .select({ name: projects.name })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(projects.id, projectId), eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(this.db, reader.id, isManager)))
      .limit(1)
    return row?.name ?? null
  }

  /**
   * Workspace projects (excluding the target) with their bounded top-level task
   * titles — the ones the READER may open. The suggestions are those titles,
   * handed back as they are: measured, a member refused a private space was
   * given its project's six task titles word for word, and its name in the
   * "learned from" line (`found-24-sep/ai-suggestions-read-the-whole-workspace`).
   */
  private async collectCandidateProjects(
    workspaceId: string,
    excludeProjectId: string | undefined,
    reader: { id: string; role?: string | null },
  ): Promise<Array<{ id: string; name: string; taskTitles: string[] }>> {
    const isManager = await resolveIsManager(this.db, workspaceId, reader.id, reader.role)
    const projectRows = await this.db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(this.db, reader.id, isManager)))
      .orderBy(desc(projects.createdAt))
      .limit(60)
    const ids = projectRows.map((p) => p.id).filter((id) => id !== excludeProjectId)
    if (ids.length === 0) return []
    const taskRows = await this.db
      .select({ projectId: lists.projectId, title: tasks.title })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .where(
        and(
          inArray(lists.projectId, ids),
          eq(tasks.isArchived, false),
          isNull(tasks.parentTaskId),
          listVisibilityFilter(reader.id, isManager),
          taskVisibilityFilter(this.db, reader.id, isManager),
        ),
      )
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

  /**
   * The tasks a reader may open in a workspace, as one WHERE fragment over
   * `tasks`: the container rule with the list's own privacy
   * (`taskInReachFilter`) and the private-task rule. `undefined` for a manager.
   */
  private async readerTaskFilter(workspaceId: string, reader: { id: string; role?: string | null }): Promise<SQL | undefined> {
    const isManager = await resolveIsManager(this.db, workspaceId, reader.id, reader.role)
    return and(taskInReachFilter(this.db, workspaceId, reader.id, isManager), taskVisibilityFilter(this.db, reader.id, isManager))
  }

  // ─── Smart workload balancing (Plan §7.12) ────────────────────────────────

  /**
   * Per-member open-task load (non-archived, non-closed) across the workspace,
   * with each member's task ids ordered least-urgent-first so the tasks handed
   * off first are the safest to move. Reuses the workload report's join shape.
   */
  async collectWorkloadLoads(workspaceId: string, reader?: { id: string; role?: string | null }): Promise<WorkloadLoad[]> {
    // As the reader sees it, when there is one: only tasks they may open are
    // counted, and only their ids handed out. Measured, a member was given the
    // admin's answer, counts of a private space's tasks and two of their ids
    // (`found-24-sep/ai-suggestions-read-the-whole-workspace`). The daily alert
    // to managers passes none; a manager sees everything anyway.
    const seen = reader ? await this.readerTaskFilter(workspaceId, reader) : undefined
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
        and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false), sql`${tasks.statusCategory} <> 'closed'`, seen),
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
  async workloadBalance(
    workspaceId: string,
    ctx: AiCtx = {},
    reader?: { id: string; role?: string | null },
  ): Promise<WorkloadBalanceResult> {
    const loads = await this.collectWorkloadLoads(workspaceId, reader)
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
          inArray(workspaceMembers.role, [...WS_MANAGER_ROLES]),
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
