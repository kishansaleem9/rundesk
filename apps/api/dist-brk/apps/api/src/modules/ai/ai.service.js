"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
exports.formatWorkspaceContext = formatWorkspaceContext;
exports.formatTaskSummaryInput = formatTaskSummaryInput;
exports.formatAutomationBehavior = formatAutomationBehavior;
exports.formatTeamWorkload = formatTeamWorkload;
exports.sanitizeAutomationSuggestions = sanitizeAutomationSuggestions;
exports.deterministicAutomationSuggestions = deterministicAutomationSuggestions;
exports.analyzeSentimentDeterministic = analyzeSentimentDeterministic;
exports.briefingHasContent = briefingHasContent;
exports.formatBriefingFallback = formatBriefingFallback;
exports.projectKeywords = projectKeywords;
exports.projectSimilarity = projectSimilarity;
exports.rankSimilarProjects = rankSimilarProjects;
exports.deterministicTaskSuggestions = deterministicTaskSuggestions;
exports.sanitizeTaskSuggestions = sanitizeTaskSuggestions;
exports.summarizeSuggestionBasis = summarizeSuggestionBasis;
exports.computeWorkloadBalance = computeWorkloadBalance;
exports.findOverloadedAssignees = findOverloadedAssignees;
exports.mapAiWorkloadMoves = mapAiWorkloadMoves;
exports.openSseStream = openSseStream;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const follow_ups_1 = require("./follow-ups");
const ai_value_1 = require("./ai-value");
const standup_1 = require("../people/standup");
const model_tiers_1 = require("./model-tiers");
const ai_categories_1 = require("./ai-categories");
const skill_proposal_1 = require("../skills/skill-proposal");
const r2_service_1 = require("../../common/storage/r2.service");
const ai_cost_1 = require("./ai-cost");
const tasks_service_1 = require("../tasks/tasks.service");
const search_service_1 = require("../search/search.service");
const embedding_service_1 = require("./embedding.service");
const embedding_1 = require("./embedding");
const attachment_text_1 = require("./attachment-text");
const container_access_guard_helper_1 = require("../../common/permissions/container-access.guard-helper");
const item_visibility_1 = require("../../common/permissions/item-visibility");
const knowledge_1 = require("./knowledge");
const ai_command_1 = require("./ai-command");
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
const COUNTS_TOWARD_LIMIT = (0, drizzle_orm_1.sql) `(${db_1.aiUsage.errorCode} is null or ${db_1.aiUsage.errorCode} = 'provider_error')`;
/** Format a Date | string | null to YYYY-MM-DD, or '' when absent/invalid. */
function toDayString(value) {
    if (!value)
        return '';
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
function truncate(input, max) {
    const t = (input ?? '').trim().replace(/\s+/g, ' ');
    return t.length > max ? `${t.slice(0, max)}…` : t;
}
/**
 * Assemble the grounded workspace context string (Plan §7.6/§7.15). Pure and
 * token-bounded: caps structure to 15 spaces × 8 projects, 15 open tasks, and
 * 40 history rows. Extracted from the DB read so it can be unit-tested directly.
 */
function formatWorkspaceContext(data) {
    const c = data.counts;
    const lines = [`Workspace: ${data.workspaceName}`, `Your role: ${data.role}`];
    if (data.currentView)
        lines.push(`Current view: ${data.currentView}`);
    lines.push(`Workspace totals: ${c.spaces} spaces, ${c.projects} projects, ${c.lists} lists, ${c.openTasks} open tasks`);
    if (data.spaces.length) {
        const structure = data.spaces
            .slice(0, 15)
            .map((s) => {
            const shown = s.projects.slice(0, 8);
            const extra = s.projects.length > shown.length ? `, +${s.projects.length - shown.length} more` : '';
            return `- ${s.name}${shown.length ? ` — projects: ${shown.join(', ')}${extra}` : ''}`;
        })
            .join('\n');
        lines.push(`Workspace structure:\n${structure}`);
    }
    if (data.openTasks.length) {
        const mine = data.openTasks
            .slice(0, 15)
            .map((t) => {
            const due = toDayString(t.dueDate);
            return `- ${t.title}${due ? ` (due ${due})` : ''} [${t.priority}]`;
        })
            .join('\n');
        lines.push(`Your open assigned tasks:\n${mine}`);
    }
    else {
        lines.push('You have no open assigned tasks.');
    }
    if (data.history.length) {
        const hist = data.history
            .slice(0, 40)
            .map((t) => {
            const when = toDayString(t.updatedAt);
            return `- ${t.title} [${t.status}]${when ? ` (updated ${when})` : ''}`;
        })
            .join('\n');
        lines.push(`Recent task history (last 90 days, tasks you're involved in):\n${hist}`);
    }
    return lines.join('\n');
}
/**
 * Assemble the enriched task-summary prompt input (Plan §7.5). Pure and bounded:
 * caps subtasks (12), blockers (10), comments (last 6, trimmed), activity (8).
 * Extracted from the DB reads so it can be unit-tested directly.
 */
function formatTaskSummaryInput(input) {
    const sections = [`Task: ${input.title || '(untitled)'}`];
    if (input.status)
        sections.push(`Status: ${input.status}`);
    if (input.priority)
        sections.push(`Priority: ${input.priority}`);
    sections.push(`Description:\n${input.description?.trim() ? input.description.trim() : '(no description)'}`);
    if (input.subtasks.length) {
        const shown = input.subtasks.slice(0, 12);
        sections.push(`Open subtasks (${input.subtasks.length}):\n${shown.map((s) => `- ${s.title} [${s.status}]`).join('\n')}`);
    }
    if (input.blockers.length) {
        const shown = input.blockers.slice(0, 10);
        sections.push(`Open blockers (${input.blockers.length}):\n${shown.map((b) => `- ${b.title} [${b.status}]`).join('\n')}`);
    }
    if (input.comments.length) {
        const recent = input.comments.slice(-6);
        sections.push(`Recent comments:\n${recent.map((cm) => `- ${cm.author ?? 'Someone'}: ${truncate(cm.body, 240)}`).join('\n')}`);
    }
    if (input.activity.length) {
        const recent = input.activity.slice(0, 8);
        sections.push(`Recent activity:\n${recent.map((a) => `- ${a.actor ?? 'Someone'} ${a.action.replace(/_/g, ' ')}`).join('\n')}`);
    }
    return sections.join('\n\n');
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
]);
const SUGGESTION_ACTIONS = new Set([
    'change_status',
    'set_priority',
    'send_notification',
    'create_subtask',
    'assign_member',
    'post_to_channel',
]);
/** Compact, human-readable behavior summary fed to the model. Pure + testable. */
function formatAutomationBehavior(b) {
    const lines = [
        `Open tasks: ${b.totalOpenTasks}`,
        `Currently overdue tasks: ${b.overdueCount}`,
        `Comment activity (last 30 days): ${b.commentActivityCount}`,
    ];
    if (b.statusTransitions.length) {
        lines.push('Most common status transitions (last 30 days):');
        for (const t of b.statusTransitions.slice(0, 6))
            lines.push(`- ${t.from} -> ${t.to} (${t.count}x)`);
    }
    else {
        lines.push('No recorded status transitions in the last 30 days.');
    }
    if (b.topAssignees.length) {
        lines.push('Most active assignees:');
        for (const a of b.topAssignees.slice(0, 5))
            lines.push(`- ${a.name} (${a.count} open assignments)`);
    }
    return lines.join('\n');
}
/** Format an assignee open-task-count list into a one-line workload signal (Plan §7.4). */
function formatTeamWorkload(rows) {
    if (rows.length === 0)
        return '';
    const parts = rows.map((r) => `${r.name}: ${r.open} open task${r.open === 1 ? '' : 's'}`);
    return `Current assignee workload — ${parts.join('; ')}`;
}
/**
 * Validate/normalize model-produced suggestions against the trigger/action
 * whitelists, coercing params to a string map and dropping anything invalid.
 * Pure so the parsing contract is unit-tested without a model. Extracted from
 * the raw text so both the AI and fallback paths share one shape.
 */
function sanitizeAutomationSuggestions(raw) {
    if (!Array.isArray(raw))
        return [];
    const result = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object')
            continue;
        const o = item;
        const trig = (o.trigger ?? {});
        const trigType = typeof trig.type === 'string' ? trig.type : '';
        if (!SUGGESTION_TRIGGERS.has(trigType))
            continue;
        const rawActions = Array.isArray(o.actions) ? o.actions : [];
        const actions = [];
        for (const a of rawActions) {
            if (!a || typeof a !== 'object')
                continue;
            const ao = a;
            const type = typeof ao.type === 'string' ? ao.type : '';
            if (!SUGGESTION_ACTIONS.has(type))
                continue;
            actions.push({ type, params: toStringMap(ao.params) });
        }
        if (actions.length === 0)
            continue;
        result.push({
            name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 120) : 'Suggested automation',
            trigger: { type: trigType, filters: toStringMap(trig.filters) },
            actions,
            rationale: typeof o.rationale === 'string' ? o.rationale.trim().slice(0, 400) : '',
        });
    }
    return result;
}
/** JSON.parse that returns undefined instead of throwing on malformed input. */
function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
/** Coerce an unknown object into a flat Record<string,string> (numbers/bools stringified). */
function toStringMap(value) {
    const out = {};
    if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            if (typeof v === 'string')
                out[k] = v;
            else if (typeof v === 'number' || typeof v === 'boolean')
                out[k] = String(v);
        }
    }
    return out;
}
/**
 * Deterministic fallback used when AI is unavailable or returns nothing usable.
 * Derives 2-4 sensible rules from the behavior stats and always returns >= 2.
 * Pure + testable.
 */
function deterministicAutomationSuggestions(b) {
    const out = [];
    const top = b.statusTransitions.find((t) => t.to);
    if (top) {
        out.push({
            name: `Notify when tasks move to ${top.to}`,
            trigger: { type: 'task.status_changed', filters: { toStatus: top.to } },
            actions: [{ type: 'send_notification', params: { message: `A task moved to ${top.to}.` } }],
            rationale: `Tasks moved to "${top.to}" ${top.count} time(s) recently — the most common transition in your workspace.`,
        });
    }
    if (b.overdueCount > 0) {
        out.push({
            name: 'Escalate overdue tasks to urgent',
            trigger: { type: 'task.overdue', filters: {} },
            actions: [{ type: 'set_priority', params: { priority: 'urgent' } }],
            rationale: `${b.overdueCount} task(s) are currently overdue — auto-escalating keeps them visible.`,
        });
    }
    if (b.commentActivityCount >= 3) {
        out.push({
            name: 'Capture follow-ups from discussion',
            trigger: { type: 'task.comment_added', filters: {} },
            actions: [{ type: 'create_subtask', params: { title: 'Follow-up from discussion' } }],
            rationale: `Comment activity is high (${b.commentActivityCount} recently) — turn discussion into tracked follow-ups.`,
        });
    }
    // Guarantee at least two suggestions even for a quiet/new workspace.
    const defaults = [
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
    ];
    for (const d of defaults) {
        if (out.length >= 2)
            break;
        if (!out.some((s) => s.trigger.type === d.trigger.type))
            out.push(d);
    }
    return out.slice(0, 4);
}
const POSITIVE_SENTIMENT_WORDS = [
    'thanks', 'thank', 'great', 'good', 'nice', 'awesome', 'excellent', 'perfect', 'love', 'done',
    'resolved', 'fixed', 'solved', 'shipped', 'approved', 'ready', 'works', 'working', 'complete',
    'completed', 'lgtm', 'progress', 'win', 'on track',
];
const NEGATIVE_SENTIMENT_WORDS = [
    'blocked', 'blocker', 'broken', 'bug', 'issue', 'problem', 'fail', 'failed', 'failing', 'error',
    'delay', 'delayed', 'stuck', 'urgent', 'wrong', 'cannot', "can't", 'cant', "won't", 'wont',
    'missing', 'risk', 'concern', 'worried', 'confusing', 'unclear', 'slipping', 'behind', 'overdue',
    'regression', 'crash',
];
/** Classify one comment as +1 / 0 / -1 by keyword hit counts (case-insensitive). */
function classifyComment(text) {
    const t = ` ${(text ?? '').toLowerCase()} `;
    let pos = 0;
    let neg = 0;
    for (const w of POSITIVE_SENTIMENT_WORDS)
        if (t.includes(w))
            pos++;
    for (const w of NEGATIVE_SENTIMENT_WORDS)
        if (t.includes(w))
            neg++;
    if (pos > neg)
        return 1;
    if (neg > pos)
        return -1;
    return 0;
}
/**
 * Deterministic keyword sentiment over a set of comment bodies (Plan §7.13).
 * Pure + testable — the always-on fallback when the model is unavailable.
 * `score` is the share of comments that read positive (neutral counts half),
 * so an empty set is a neutral 50.
 */
function analyzeSentimentDeterministic(texts) {
    const bodies = (texts ?? []).map((t) => (t ?? '').trim()).filter((t) => t.length > 0);
    let positive = 0;
    let negative = 0;
    for (const body of bodies) {
        const c = classifyComment(body);
        if (c === 1)
            positive++;
        else if (c === -1)
            negative++;
    }
    const samples = bodies.length;
    const neutral = samples - positive - negative;
    const score = samples === 0 ? 50 : Math.round(((positive + neutral * 0.5) / samples) * 100);
    const label = score >= 60 ? 'positive' : score <= 40 ? 'negative' : 'neutral';
    return { score, label, positive, negative, samples, source: 'deterministic' };
}
/** True when the briefing has at least one noteworthy item across all buckets. */
function briefingHasContent(data) {
    return (data.overdue.length > 0 ||
        data.dueToday.length > 0 ||
        data.blocking.length > 0 ||
        data.atRisk.length > 0);
}
/** Join a small set of task titles into a readable clause, capped for length. */
function briefingList(titles, max = 3) {
    const shown = titles.slice(0, max);
    const extra = titles.length - shown.length;
    const joined = shown.map((t) => `“${t}”`).join(', ');
    return extra > 0 ? `${joined} (+${extra} more)` : joined;
}
/**
 * Deterministic daily-briefing text (Plan §7.11). Pure + testable — the always-on
 * fallback used when the model is unavailable (ANTHROPIC_API_KEY unset). Leads
 * with the most urgent buckets (overdue, then blocking others, then due-today,
 * then at-risk) and always returns a non-empty, human-readable body.
 */
function formatBriefingFallback(data) {
    const parts = [];
    const first = (data.displayName || '').trim().split(/\s+/)[0] || 'there';
    if (data.overdue.length)
        parts.push(`You have ${data.overdue.length} overdue task${data.overdue.length === 1 ? '' : 's'}: ${briefingList(data.overdue)}.`);
    if (data.blocking.length)
        parts.push(`${data.blocking.length} of your task${data.blocking.length === 1 ? ' is' : 's are'} blocking others: ${briefingList(data.blocking)}.`);
    if (data.dueToday.length)
        parts.push(`${data.dueToday.length} due today: ${briefingList(data.dueToday)}.`);
    if (data.atRisk.length)
        parts.push(`${data.atRisk.length} at risk soon: ${briefingList(data.atRisk)}.`);
    return parts.length
        ? `Good morning, ${first}. ${parts.join(' ')}`
        : `Good morning, ${first}. Nothing urgent on your plate today — a good time to get ahead.`;
}
const TASK_PRIORITY_VALUES = new Set(['urgent', 'high', 'normal', 'low']);
const PROJECT_STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'project', 'app', 'new', 'v1', 'v2',
]);
/** Tokenize a project name/description into a lowercased keyword set (stopwords + short words removed). Pure. */
function projectKeywords(text) {
    const out = new Set();
    for (const raw of (text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
        const w = raw.trim();
        if (w.length >= 3 && !PROJECT_STOPWORDS.has(w))
            out.add(w);
    }
    return out;
}
/**
 * Similarity between a target project name and a candidate name by keyword
 * overlap (Jaccard) plus a substring-containment bonus. Range 0–1. Pure + testable.
 */
function projectSimilarity(target, candidate) {
    const a = projectKeywords(target);
    const b = projectKeywords(candidate);
    if (a.size === 0 || b.size === 0)
        return 0;
    let shared = 0;
    for (const w of a)
        if (b.has(w))
            shared++;
    const union = new Set([...a, ...b]).size;
    const jaccard = union === 0 ? 0 : shared / union;
    const ta = target.trim().toLowerCase();
    const tc = candidate.trim().toLowerCase();
    const contains = ta && tc && (tc.includes(ta) || ta.includes(tc)) ? 0.25 : 0;
    return Math.min(1, jaccard + contains);
}
/**
 * Rank candidate projects by similarity to the target name; keep those with any
 * signal, or fall back to the most recent few when nothing matches. Pure + testable.
 */
function rankSimilarProjects(target, candidates, limit = 5) {
    const scored = candidates.map((c) => ({ ...c, score: projectSimilarity(target, c.name) }));
    scored.sort((a, b) => b.score - a.score);
    const withSignal = scored.filter((c) => c.score > 0);
    return (withSignal.length ? withSignal : scored).slice(0, limit);
}
/** Normalize a task title for case/space-insensitive frequency counting. */
function taskTitleKey(title) {
    return title.trim().toLowerCase().replace(/\s+/g, ' ');
}
/**
 * Deterministic task suggestions (Plan §7.10 fallback): the most-frequent task
 * titles across the similar projects, most common first (a title is counted at
 * most once per project so one large project can't dominate). Pure + testable —
 * the always-on fallback when the model is unavailable.
 */
function deterministicTaskSuggestions(similar, limit = 8) {
    const freq = new Map();
    for (const p of similar) {
        const seen = new Set();
        for (const raw of p.taskTitles) {
            const title = (raw ?? '').trim();
            if (!title)
                continue;
            const key = taskTitleKey(title);
            if (seen.has(key))
                continue;
            seen.add(key);
            const cur = freq.get(key);
            if (cur)
                cur.count++;
            else
                freq.set(key, { title, count: 1 });
        }
    }
    return [...freq.values()]
        .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
        .slice(0, limit)
        .map((f) => ({ title: f.title }));
}
/** Validate/normalize model task suggestions against the priority whitelist, de-duping by title. Pure. */
function sanitizeTaskSuggestions(raw, limit = 10) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    const seen = new Set();
    for (const item of raw) {
        let title = '';
        let priority;
        if (typeof item === 'string')
            title = item;
        else if (item && typeof item === 'object') {
            const o = item;
            title = typeof o.title === 'string' ? o.title : '';
            if (typeof o.priority === 'string' && TASK_PRIORITY_VALUES.has(o.priority)) {
                priority = o.priority;
            }
        }
        title = title.trim().replace(/^\d+[.)]\s*/, '').slice(0, 200);
        if (!title)
            continue;
        const key = taskTitleKey(title);
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(priority ? { title, priority } : { title });
        if (out.length >= limit)
            break;
    }
    return out;
}
/** Human-readable "learned from" basis line for the suggestions response. Pure. */
function summarizeSuggestionBasis(similar) {
    const named = similar.filter((p) => p.taskTitles.length > 0).map((p) => p.name);
    if (named.length === 0)
        return 'No similar projects with tasks yet — suggesting a common starter task list.';
    const shown = named.slice(0, 4);
    const extra = named.length - shown.length;
    return `Learned from ${named.length} similar project${named.length === 1 ? '' : 's'}: ${shown.join(', ')}${extra > 0 ? `, +${extra} more` : ''}.`;
}
/**
 * Deterministic workload redistribution (Plan §7.12 fallback): greedily pair the
 * most-overloaded assignee with the least-loaded one and propose moving enough
 * tasks to close ~half the gap, drawing the specific task ids from the
 * overloaded assignee. Only rebalances a real imbalance (source above the team
 * average, gap ≥ 2). Pure + testable.
 */
function computeWorkloadBalance(loads, opts = {}) {
    const source = opts.source ?? 'heuristic';
    const maxSuggestions = opts.maxSuggestions ?? 3;
    const people = loads.map((l) => ({ userId: l.userId, name: l.name, remaining: [...l.taskIds] }));
    const total = loads.reduce((s, l) => s + l.open, 0);
    const roundedAvg = loads.length ? Math.round((total / loads.length) * 10) / 10 : 0;
    const load = new Map(loads.map((l) => [l.userId, l.open]));
    const suggestions = [];
    for (let i = 0; i < maxSuggestions; i++) {
        const sorted = [...people].sort((a, b) => (load.get(b.userId) ?? 0) - (load.get(a.userId) ?? 0));
        const from = sorted[0];
        const to = sorted[sorted.length - 1];
        if (!from || !to || from.userId === to.userId)
            break;
        const fromLoad = load.get(from.userId) ?? 0;
        const toLoad = load.get(to.userId) ?? 0;
        const gap = fromLoad - toLoad;
        if (fromLoad <= roundedAvg || gap < 2)
            break;
        const move = Math.min(Math.floor(gap / 2), from.remaining.length);
        if (move < 1)
            break;
        const taskIds = from.remaining.splice(0, move);
        load.set(from.userId, fromLoad - move);
        load.set(to.userId, toLoad + move);
        suggestions.push({
            fromUserId: from.userId,
            fromName: from.name,
            toUserId: to.userId,
            toName: to.name,
            count: move,
            taskIds,
            rationale: `${from.name} has ${fromLoad} open tasks vs ${to.name}'s ${toLoad}; moving ${move} rebalances toward the team average of ${roundedAvg}.`,
            source,
        });
    }
    return {
        source,
        average: roundedAvg,
        loads: loads.map((l) => ({ userId: l.userId, name: l.name, open: l.open })),
        suggestions,
    };
}
/**
 * Identify assignees significantly overloaded relative to the team (Plan §7.12
 * proactive alert): open count ≥ `absoluteMin` AND ≥ team average × `factor`.
 * Pure + testable.
 */
function findOverloadedAssignees(loads, opts = {}) {
    const factor = opts.factor ?? 1.5;
    const absoluteMin = opts.absoluteMin ?? 6;
    if (loads.length < 2)
        return [];
    const total = loads.reduce((s, l) => s + l.open, 0);
    const average = total / loads.length;
    const roundedAvg = Math.round(average * 10) / 10;
    return loads
        .filter((l) => l.open >= absoluteMin && l.open >= average * factor)
        .sort((a, b) => b.open - a.open)
        .map((l) => ({ userId: l.userId, name: l.name, open: l.open, average: roundedAvg }));
}
/**
 * Map model-proposed workload moves ({fromUserId,toUserId,count}) onto the REAL
 * per-assignee loads, resolving the actual task ids server-side (never trusting
 * model-invented ids) and clamping counts to what the source actually has.
 * Pure + testable.
 */
function mapAiWorkloadMoves(raw, loads) {
    const byId = new Map(loads.map((l) => [l.userId, { name: l.name, remaining: [...l.taskIds] }]));
    const total = loads.reduce((s, l) => s + l.open, 0);
    const average = loads.length ? Math.round((total / loads.length) * 10) / 10 : 0;
    const suggestions = [];
    if (Array.isArray(raw)) {
        for (const item of raw) {
            if (!item || typeof item !== 'object')
                continue;
            const o = item;
            const from = typeof o.fromUserId === 'string' ? byId.get(o.fromUserId) : undefined;
            const to = typeof o.toUserId === 'string' ? byId.get(o.toUserId) : undefined;
            const fromId = typeof o.fromUserId === 'string' ? o.fromUserId : '';
            const toId = typeof o.toUserId === 'string' ? o.toUserId : '';
            if (!from || !to || fromId === toId || from.remaining.length === 0)
                continue;
            const want = Math.max(1, Math.min(Math.trunc(Number(o.count) || 1), from.remaining.length));
            const taskIds = from.remaining.splice(0, want);
            suggestions.push({
                fromUserId: fromId,
                fromName: from.name,
                toUserId: toId,
                toName: to.name,
                count: taskIds.length,
                taskIds,
                rationale: typeof o.rationale === 'string' && o.rationale.trim()
                    ? o.rationale.trim().slice(0, 300)
                    : `Move ${taskIds.length} task${taskIds.length === 1 ? '' : 's'} from ${from.name} to ${to.name} to balance load.`,
                source: 'ai',
            });
            if (suggestions.length >= 3)
                break;
        }
    }
    return {
        source: 'ai',
        average,
        loads: loads.map((l) => ({ userId: l.userId, name: l.name, open: l.open })),
        suggestions,
    };
}
function openSseStream(res) {
    const reply = res;
    if (typeof reply.hijack === 'function')
        reply.hijack();
    const raw = reply.raw ?? reply;
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache');
    raw.setHeader('Connection', 'keep-alive');
    raw.flushHeaders?.();
    return raw;
}
let AiService = AiService_1 = class AiService {
    constructor(config, db, tasks, search, embeddings, r2) {
        this.config = config;
        this.db = db;
        this.tasks = tasks;
        this.search = search;
        this.embeddings = embeddings;
        this.r2 = r2;
        this.client = null;
        const apiKey = config.get('ANTHROPIC_API_KEY');
        if (apiKey) {
            this.client = new sdk_1.default({ apiKey });
        }
    }
    get claude() {
        if (!this.client) {
            throw new Error('ANTHROPIC_API_KEY is not configured');
        }
        return this.client;
    }
    get hourlyLimit() {
        const v = Number(this.config.get('AI_HOURLY_LIMIT'));
        return Number.isFinite(v) && v > 0 ? v : 200;
    }
    /**
     * Enforce a per-user hourly AI call cap (Plan §7.15 "per-user rate limits").
     * Throws 429 when exceeded. No-op for calls without a user context.
     */
    get orgHourlyLimit() {
        const v = Number(this.config.get('AI_ORG_HOURLY_LIMIT'));
        return Number.isFinite(v) && v > 0 ? v : 2000;
    }
    async assertWithinRateLimit(ctx, now = new Date(), feature = 'unknown') {
        const since = new Date(now.getTime() - 3_600_000);
        if (ctx.userId) {
            const [row] = await this.db
                .select({ c: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(db_1.aiUsage)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.aiUsage.userId, ctx.userId), (0, drizzle_orm_1.gte)(db_1.aiUsage.createdAt, since), COUNTS_TOWARD_LIMIT));
            if ((row?.c ?? 0) >= this.hourlyLimit) {
                const message = `AI hourly rate limit reached (${this.hourlyLimit}/hour). Try again later.`;
                await this.recordFailure(feature, 'rate-limited', ctx, 'rate_limited', message);
                throw new common_1.HttpException(message, common_1.HttpStatus.TOO_MANY_REQUESTS);
            }
        }
        // Per-organization (workspace) cap (Plan §7.15).
        if (ctx.workspaceId) {
            const [row] = await this.db
                .select({ c: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(db_1.aiUsage)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.aiUsage.workspaceId, ctx.workspaceId), (0, drizzle_orm_1.gte)(db_1.aiUsage.createdAt, since), COUNTS_TOWARD_LIMIT));
            if ((row?.c ?? 0) >= this.orgHourlyLimit) {
                const message = `Workspace AI hourly limit reached (${this.orgHourlyLimit}/hour). Try again later.`;
                await this.recordFailure(feature, 'rate-limited', ctx, 'rate_limited', message);
                throw new common_1.HttpException(message, common_1.HttpStatus.TOO_MANY_REQUESTS);
            }
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
    async assertAvailable(feature, ctx = {}) {
        if (this.isAvailable())
            return;
        const message = 'AI features are not configured';
        await this.recordFailure(feature, 'none', ctx, 'not_configured', message);
        throw new common_1.HttpException(message, common_1.HttpStatus.SERVICE_UNAVAILABLE);
    }
    /**
     * Create a message: rate-limit, enable prompt caching on the system block,
     * and record token usage (Plan §7.15). All non-streaming AI calls route here.
     */
    async complete(feature, ctx, params) {
        await this.assertWithinRateLimit(ctx, new Date(), feature);
        // Prompt caching: mark the (repeated) system prompt as a cache breakpoint.
        const finalParams = typeof params.system === 'string' && params.system.length > 200
            ? { ...params, system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }] }
            : params;
        /*
         * §V2-11 — THE OTHER HALF OF THE STATUS COLUMN.
         *
         * Every non-streaming AI call funnels through here, so this is the one
         * place a provider failure can be written down without adding a catch to
         * forty call sites. The error is rethrown untouched: this records, it does
         * not handle. Swallowing it here would turn an outage into forty callers
         * quietly returning their fallbacks.
         */
        let response;
        try {
            response = await this.claude.messages.create(finalParams);
        }
        catch (err) {
            await this.recordFailure(feature, params.model, ctx, 'provider_error', err instanceof Error ? err.message : 'AI request failed');
            throw err;
        }
        void this.recordUsage(feature, params.model, ctx, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);
        return response;
    }
    async recordUsage(feature, model, ctx, inputTokens, outputTokens) {
        try {
            await this.db.insert(db_1.aiUsage).values({
                workspaceId: ctx.workspaceId ?? null,
                userId: ctx.userId ?? null,
                feature,
                model,
                inputTokens,
                outputTokens,
                status: 'succeeded',
            });
        }
        catch {
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
    async recordFailure(feature, model, ctx, errorCode, errorMessage) {
        try {
            await this.db.insert(db_1.aiUsage).values({
                workspaceId: ctx.workspaceId ?? null,
                userId: ctx.userId ?? null,
                feature,
                model,
                inputTokens: 0,
                outputTokens: 0,
                status: 'failed',
                errorCode,
                errorMessage: (errorMessage ?? '').slice(0, 500) || null,
            });
        }
        catch {
            // Recording a failure must never become a second failure.
        }
    }
    /** Aggregate AI usage + estimated cost, per user and per model (Plan §7.15). */
    async usageSummary(opts = {}) {
        // §A4.4 — this became a rendered screen, so the scope check has to be real:
        // spend and per-person usage is workspace-confidential. No workspaceId means
        // the platform-wide roll-up, which is a super-admin view.
        if (opts.actor && opts.actor.role !== 'super_admin') {
            if (!opts.workspaceId)
                throw new common_1.ForbiddenException('Workspace context required');
            const [member] = await this.db
                .select({ userId: db_1.workspaceMembers.userId })
                .from(db_1.workspaceMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, opts.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, opts.actor.id)))
                .limit(1);
            if (!member)
                throw new common_1.ForbiddenException('Workspace membership required');
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
        const filters = [(0, drizzle_orm_1.eq)(db_1.aiUsage.status, 'succeeded')];
        if (opts.workspaceId)
            filters.push((0, drizzle_orm_1.eq)(db_1.aiUsage.workspaceId, opts.workspaceId));
        if (opts.from)
            filters.push((0, drizzle_orm_1.gte)(db_1.aiUsage.createdAt, opts.from));
        if (opts.to)
            filters.push((0, drizzle_orm_1.lte)(db_1.aiUsage.createdAt, opts.to));
        const where = (0, drizzle_orm_1.and)(...filters);
        const rows = await this.db
            .select({
            userId: db_1.aiUsage.userId,
            model: db_1.aiUsage.model,
            // §V2-11 — grouped by feature too, so the value panel can attribute a
            // saving to what produced it. A total nobody can break down is a total
            // nobody believes.
            feature: db_1.aiUsage.feature,
            inTok: (0, drizzle_orm_1.sql) `coalesce(sum(${db_1.aiUsage.inputTokens}),0)::int`,
            outTok: (0, drizzle_orm_1.sql) `coalesce(sum(${db_1.aiUsage.outputTokens}),0)::int`,
            calls: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(db_1.aiUsage)
            .where(where)
            .groupBy(db_1.aiUsage.userId, db_1.aiUsage.model, db_1.aiUsage.feature);
        let totalCost = 0;
        let totalCalls = 0;
        let totalIn = 0;
        let totalOut = 0;
        const byUser = {};
        const byModel = {};
        const byFeature = {};
        for (const r of rows) {
            const cost = (0, ai_cost_1.estimateAiCostUsd)(r.model, r.inTok, r.outTok);
            totalCost += cost;
            totalCalls += r.calls;
            totalIn += r.inTok;
            totalOut += r.outTok;
            const u = (byUser[r.userId ?? 'unknown'] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
            u.calls += r.calls;
            u.inputTokens += r.inTok;
            u.outputTokens += r.outTok;
            u.costUsd += cost;
            const m = (byModel[r.model] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
            m.calls += r.calls;
            m.inputTokens += r.inTok;
            m.outputTokens += r.outTok;
            m.costUsd += cost;
            const f = (byFeature[r.feature] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
            f.calls += r.calls;
            f.inputTokens += r.inTok;
            f.outputTokens += r.outTok;
            f.costUsd += cost;
        }
        const round = (n) => Math.round(n * 10000) / 10000;
        return {
            totals: { calls: totalCalls, inputTokens: totalIn, outputTokens: totalOut, costUsd: round(totalCost) },
            byUser: Object.fromEntries(Object.entries(byUser).map(([k, v]) => [k, { ...v, costUsd: round(v.costUsd) }])),
            byModel: Object.fromEntries(Object.entries(byModel).map(([k, v]) => [k, { ...v, costUsd: round(v.costUsd) }])),
            byFeature: Object.fromEntries(Object.entries(byFeature).map(([k, v]) => [k, { ...v, costUsd: round(v.costUsd) }])),
        };
    }
    /**
     * §V2-11, frames `19:00`/`19:05` — what the AI was WORTH, beside what it cost.
     *
     * Shares `usageSummary`'s access check by calling it: spend and per-person
     * usage are workspace-confidential, and a second endpoint answering the same
     * question through a second, subtly different guard is how a leak happens.
     */
    async valueSummary(opts) {
        const usage = await this.usageSummary(opts);
        const [ws] = await this.db
            .select({
            minutes: db_1.workspaces.aiMinutesSavedPerRun,
            rate: db_1.workspaces.aiHourlyRateCents,
        })
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, opts.workspaceId))
            .limit(1);
        if (!ws)
            throw new common_1.NotFoundException('Workspace not found');
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
        const rollup = (0, ai_categories_1.rollUpByCategory)(usage.byFeature);
        return {
            ...(0, ai_value_1.summariseValue)(usage.totals.calls, usage.totals.costUsd, {
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
        };
    }
    /**
     * §V2-11 — "Edit benchmark", frame `19:00`.
     *
     * Admin-only, because it changes a number the whole workspace is shown and
     * that somebody may put in front of a client. Validated here as well as by
     * the database's CHECK: the API should refuse with a sentence, not surface a
     * constraint violation.
     */
    async updateValueBenchmark(workspaceId, actor, patch) {
        if (actor.role !== 'super_admin') {
            const [member] = await this.db
                .select({ role: db_1.workspaceMembers.role })
                .from(db_1.workspaceMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actor.id)))
                .limit(1);
            if (!member)
                throw new common_1.ForbiddenException('Workspace membership required');
            if (!['workspace_admin', 'manager', 'super_admin'].includes(member.role)) {
                throw new common_1.ForbiddenException('Only a workspace admin can change the AI benchmark');
            }
        }
        const problem = (0, ai_value_1.validateBenchmark)(patch);
        if (problem)
            throw new common_1.BadRequestException(problem);
        const set = { updatedAt: new Date() };
        if (patch.minutesSavedPerRun !== undefined)
            set.aiMinutesSavedPerRun = patch.minutesSavedPerRun;
        if (patch.hourlyRateCents !== undefined)
            set.aiHourlyRateCents = patch.hourlyRateCents;
        const [row] = await this.db
            .update(db_1.workspaces)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
            .returning({ minutes: db_1.workspaces.aiMinutesSavedPerRun, rate: db_1.workspaces.aiHourlyRateCents });
        if (!row)
            throw new common_1.NotFoundException('Workspace not found');
        return { minutesSavedPerRun: row.minutes, hourlyRateCents: row.rate };
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
    async runLog(opts) {
        // Same confidentiality as the summary, asserted the same way.
        await this.usageSummary({ workspaceId: opts.workspaceId, actor: opts.actor });
        const filters = [(0, drizzle_orm_1.eq)(db_1.aiUsage.workspaceId, opts.workspaceId)];
        if (opts.from)
            filters.push((0, drizzle_orm_1.gte)(db_1.aiUsage.createdAt, opts.from));
        if (opts.to)
            filters.push((0, drizzle_orm_1.lte)(db_1.aiUsage.createdAt, opts.to));
        if (opts.feature)
            filters.push((0, drizzle_orm_1.eq)(db_1.aiUsage.feature, opts.feature));
        if (opts.userId)
            filters.push((0, drizzle_orm_1.eq)(db_1.aiUsage.userId, opts.userId));
        if (opts.status)
            filters.push((0, drizzle_orm_1.eq)(db_1.aiUsage.status, opts.status));
        const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
        const rows = await this.db
            .select({
            id: db_1.aiUsage.id,
            feature: db_1.aiUsage.feature,
            model: db_1.aiUsage.model,
            inputTokens: db_1.aiUsage.inputTokens,
            outputTokens: db_1.aiUsage.outputTokens,
            createdAt: db_1.aiUsage.createdAt,
            userId: db_1.aiUsage.userId,
            status: db_1.aiUsage.status,
            errorCode: db_1.aiUsage.errorCode,
            errorMessage: db_1.aiUsage.errorMessage,
        })
            .from(db_1.aiUsage)
            .where((0, drizzle_orm_1.and)(...filters))
            .orderBy((0, drizzle_orm_1.desc)(db_1.aiUsage.createdAt))
            .limit(limit);
        return rows.map((r) => ({
            ...r,
            costUsd: Math.round((0, ai_cost_1.estimateAiCostUsd)(r.model, r.inputTokens, r.outputTokens) * 10000) / 10000,
        }));
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
    async modelPreference(userId, workspaceId) {
        const [row] = await this.db
            .select({ tier: db_1.aiModelPreferences.preferredTier, updatedAt: db_1.aiModelPreferences.updatedAt })
            .from(db_1.aiModelPreferences)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.aiModelPreferences.userId, userId), (0, drizzle_orm_1.eq)(db_1.aiModelPreferences.workspaceId, workspaceId)))
            .limit(1);
        // A value that stopped being a tier (a renamed tier, a hand-edited row) is
        // reported as unset rather than echoed back: the picker would have nothing
        // to select, and `modelForTier` would silently answer with the default
        // anyway. Saying "not set" is the same behaviour, told truthfully.
        if (!row || !(0, model_tiers_1.isSelectableTier)(row.tier)) {
            return { preferredTier: model_tiers_1.DEFAULT_TIER, isSet: false, updatedAt: null };
        }
        return { preferredTier: row.tier, isSet: true, updatedAt: row.updatedAt };
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
    async setModelPreference(userId, workspaceId, preferredTier) {
        if (!(0, model_tiers_1.isSelectableTier)(preferredTier)) {
            throw new common_1.BadRequestException(`"${preferredTier}" is not a model this workspace can route to`);
        }
        const [member] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!member)
            throw new common_1.ForbiddenException('Workspace membership required');
        // Upsert on the unique (user, workspace) index — one statement, so two
        // tabs pressing "set as preferred" at once cannot insert two rows.
        await this.db
            .insert(db_1.aiModelPreferences)
            .values({ userId, workspaceId, preferredTier })
            .onConflictDoUpdate({
            target: [db_1.aiModelPreferences.userId, db_1.aiModelPreferences.workspaceId],
            set: { preferredTier, updatedAt: new Date() },
        });
        return this.modelPreference(userId, workspaceId);
    }
    // ─── Task generation from a natural language prompt ───────────────────────
    async generateTask(prompt, context, ctx = {}, customFields) {
        // When the destination project has custom fields, let the model suggest
        // values for them (resolved by name on save, like the task-template path).
        const fieldsBlock = customFields?.length
            ? `\nThe destination project has these custom fields — suggest values ONLY for fields you can confidently fill, as a "customFieldValues" array of { "fieldName": string, "value": string|number|boolean }. Use the EXACT field name. Omit fields you cannot fill.\n${customFields
                .map((f) => `- ${f.name} (${f.type}${f.options?.length ? `: ${f.options.join(', ')}` : ''})`)
                .join('\n')}`
            : '';
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
${context ? `\nWorkspace context:\n${context}` : ''}${fieldsBlock}`;
        const response = await this.complete('task.generate', ctx, {
            model: 'claude-haiku-4-5',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: `Create a task for: ${prompt}` }],
        });
        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]+\}/);
        if (!jsonMatch)
            throw new Error('AI returned invalid response');
        return JSON.parse(jsonMatch[0]);
    }
    // ─── Meeting notes → action items ─────────────────────────────────────────
    async extractTasksFromNotes(notes, ctx = {}) {
        const response = await this.complete('meeting.notes', ctx, {
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            system: `You are a meeting notes analyzer for Rundesk.
Extract all action items from the meeting notes and return them as a JSON array.
Each action item should have: title, description, assigneeName (if mentioned), dueDate (ISO 8601 if mentioned, else null), priority (urgent/high/normal/low).
Respond ONLY with a valid JSON array.`,
            messages: [{ role: 'user', content: `Meeting notes:\n\n${notes}` }],
        });
        const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
        const jsonMatch = text.match(/\[[\s\S]+\]/);
        if (!jsonMatch)
            return [];
        return JSON.parse(jsonMatch[0]);
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
    async notesFromTranscript(transcript, ctx = {}) {
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
        });
        return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    }
    // ─── Auto-priority detection ──────────────────────────────────────────────
    async suggestPriority(title, description, ctx = {}) {
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
        });
        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]+\}/);
        if (!jsonMatch)
            return { priority: 'normal', reasoning: 'Could not determine priority' };
        return JSON.parse(jsonMatch[0]);
    }
    // ─── Task / Project summary ───────────────────────────────────────────────
    async summarize(content, type = 'task', ctx = {}) {
        const response = await this.complete('summarize', ctx, {
            model: 'claude-haiku-4-5',
            max_tokens: 512,
            system: `You are a concise summarizer for Rundesk.
Write a 2-3 sentence summary of the given ${type} content in plain text.
Focus on the key goals, current status, and any blockers.`,
            messages: [{ role: 'user', content: content }],
        });
        return response.content[0].type === 'text' ? response.content[0].text : '';
    }
    // ─── Writing assistant ────────────────────────────────────────────────────
    async improveWriting(text, mode = 'improve', ctx = {}) {
        const instructions = {
            improve: 'Improve the clarity, grammar, and professionalism of this text while keeping the same meaning.',
            shorten: 'Shorten this text to its essential points without losing meaning.',
            expand: 'Expand this text with more detail and context.',
            format: 'Reformat this text with proper markdown: headings, bullet points, bold for key terms.',
        };
        const response = await this.complete('writing.improve', ctx, {
            model: 'claude-haiku-4-5',
            max_tokens: 1024,
            system: `You are a writing assistant. ${instructions[mode]} Return ONLY the improved text.`,
            messages: [{ role: 'user', content: text }],
        });
        return response.content[0].type === 'text' ? response.content[0].text : text;
    }
    // ─── AI Chatbot (streaming) ───────────────────────────────────────────────
    async chatStream(messages, workspaceContext, res, ctx = {}, 
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
    skillPrompt, 
    /**
     * §15 — the composer's model picker. Omitted or unrecognised resolves to
     * the tier chat already used, so nothing changes for a caller that does not
     * pass one.
     */
    tier, 
    /**
     * G13-10 — an SSE stream the caller already opened so it could report its
     * own retrieval steps before the model was ever called. When absent this
     * opens its own, so every existing caller is unaffected.
     */
    opened) {
        // Enforce rate limits before we hijack the reply for streaming.
        await this.assertWithinRateLimit(ctx, new Date(), 'chat');
        const model = (0, model_tiers_1.modelForTier)(tier);
        const intro = skillPrompt?.trim()
            ? skillPrompt.trim()
            : `You are Rundesk AI, an intelligent assistant embedded in the Rundesk project management platform.
You help users manage tasks, understand their workspace, draft messages, generate content, and answer questions.
Be concise, helpful, and action-oriented.`;
        const systemPrompt = `${intro}

Workspace context:
${workspaceContext}

Current date: ${new Date().toISOString().split('T')[0]}

${follow_ups_1.FOLLOW_UP_INSTRUCTION}`;
        // Already open when the caller reported its own steps first (G13-10);
        // otherwise open it here. Calling setHeader twice throws once the headers
        // have been flushed, which is why this is a branch rather than a re-run.
        const raw = opened ?? openSseStream(res);
        try {
            /*
             * G13-10 [18:33–18:36] — the last step, named where it happens.
             *
             * Everything above this line is retrieval the caller already reported.
             * This one belongs to the model call, so it is written here rather than
             * guessed at by the controller — a step that claims work happening
             * somewhere else is how a trace stops being evidence.
             */
            raw.write(`data: ${JSON.stringify({ step: 'writing' })}\n\n`);
            const stream = this.claude.messages.stream({
                model,
                max_tokens: 2048,
                // Cache the (large, repeated) system context across turns.
                system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
                messages,
            });
            /*
             * G13-9 [18:42] — the follow-ups ride this same completion, after a
             * marker, so offering them costs no second billed call on every turn.
             * The splitter keeps that trade honest: it holds back exactly the
             * characters that could still become the marker, so a reader never sees
             * `<<<FOLLOW` when a chunk boundary lands mid-marker, and ordinary prose
             * is never delayed.
             */
            const followUps = (0, follow_ups_1.createFollowUpSplitter)();
            for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    const visible = followUps.push(chunk.delta.text);
                    if (visible)
                        raw.write(`data: ${JSON.stringify({ delta: visible })}\n\n`);
                }
            }
            // Anything still held back was never a marker and belongs to the answer.
            const tail = followUps.flush();
            if (tail)
                raw.write(`data: ${JSON.stringify({ delta: tail })}\n\n`);
            const suggestions = followUps.followUps();
            if (suggestions.length)
                raw.write(`data: ${JSON.stringify({ followUps: suggestions })}\n\n`);
            const final = await stream.finalMessage().catch(() => null);
            void this.recordUsage('chat', 
            // The model actually used. Hardcoding the old one here would make the
            // usage table quietly wrong the moment anyone picked Fast.
            model, ctx, final?.usage?.input_tokens ?? 0, final?.usage?.output_tokens ?? 0);
            raw.write('data: [DONE]\n\n');
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'AI request failed';
            // §V2-11 — a stream that died is a failed run. The client sees `{error}`
            // and always did; until 0150 nothing else ever did.
            await this.recordFailure('chat', model, ctx, 'provider_error', message);
            raw.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        }
        finally {
            raw.end();
        }
    }
    /**
     * Non-streaming chatbot reply (Plan §7.6) — used when @Rundesk is mentioned
     * in a channel so the answer can be posted as a normal message.
     */
    async chatReply(messages, workspaceContext, ctx = {}, 
    /**
     * §15 — answering as a skill invoked by its slash command. First in the
     * prompt and replacing the generic description, for the same reason as
     * `chatStream`: a skill that asks for a particular voice must not be
     * overruled by a default two lines below it.
     */
    skillPrompt) {
        const intro = skillPrompt?.trim()
            ? skillPrompt.trim()
            : `You are Rundesk AI, an assistant inside the Rundesk project management chat.
A teammate mentioned you (@Rundesk). Answer helpfully and concisely in 1-4 sentences.`;
        const systemPrompt = `${intro}

Workspace context:
${workspaceContext}

Current date: ${new Date().toISOString().split('T')[0]}`;
        const response = await this.complete('chat.mention', ctx, {
            model: 'claude-sonnet-4-6',
            max_tokens: 700,
            system: systemPrompt,
            messages,
        });
        return response.content[0]?.type === 'text' ? response.content[0].text : '';
    }
    /**
     * Build a real workspace context string for the chatbot (Plan §7.6/§7.15):
     * the user's role, workspace structure (space/project/list counts + names),
     * their open assigned tasks, and their recent task history (last 90 days) —
     * plus an optional current-view hint from the caller — so answers are grounded
     * instead of a workspace-ID stub. Token-bounded via `formatWorkspaceContext`.
     */
    async buildWorkspaceContext(workspaceId, userId, opts = {}) {
        try {
            const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            const [[wsRow], [roleRow], [counts], spaceRows, projectRows, openTasks, history] = await Promise.all([
                this.db.select({ name: db_1.workspaces.name }).from(db_1.workspaces).where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId)).limit(1),
                this.db
                    .select({ role: db_1.workspaceMembers.role })
                    .from(db_1.workspaceMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
                    .limit(1),
                this.db
                    .select({
                    spaces: (0, drizzle_orm_1.sql) `count(distinct ${db_1.spaces.id})::int`,
                    projects: (0, drizzle_orm_1.sql) `count(distinct ${db_1.projects.id})::int`,
                    lists: (0, drizzle_orm_1.sql) `count(distinct ${db_1.lists.id})::int`,
                    openTasks: (0, drizzle_orm_1.sql) `count(distinct case when ${db_1.tasks.statusCategory} <> 'closed' and ${db_1.tasks.isArchived} = false then ${db_1.tasks.id} end)::int`,
                })
                    .from(db_1.spaces)
                    .leftJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.spaceId, db_1.spaces.id))
                    .leftJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.projectId, db_1.projects.id))
                    .leftJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.listId, db_1.lists.id))
                    .where((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)),
                this.db
                    .select({ id: db_1.spaces.id, name: db_1.spaces.name })
                    .from(db_1.spaces)
                    .where((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId))
                    .orderBy((0, drizzle_orm_1.asc)(db_1.spaces.name))
                    .limit(20),
                this.db
                    .select({ id: db_1.projects.id, name: db_1.projects.name, spaceId: db_1.projects.spaceId })
                    .from(db_1.projects)
                    .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                    .where((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId))
                    .orderBy((0, drizzle_orm_1.asc)(db_1.projects.name))
                    .limit(60),
                this.db
                    .select({ title: db_1.tasks.title, dueDate: db_1.tasks.dueDate, priority: db_1.tasks.priority })
                    .from(db_1.tasks)
                    .innerJoin(db_1.taskAssignees, (0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, db_1.tasks.id))
                    .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                    .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                    .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, userId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.ne)(db_1.tasks.statusCategory, 'closed')))
                    .orderBy((0, drizzle_orm_1.asc)(db_1.tasks.dueDate))
                    .limit(15),
                // Task history (Plan §7.15): recently updated/completed tasks the user is
                // involved in (creator or assignee) within the last 90 days.
                this.db
                    .select({ title: db_1.tasks.title, status: db_1.tasks.status, updatedAt: db_1.tasks.updatedAt })
                    .from(db_1.tasks)
                    .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                    .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                    .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.tasks.updatedAt, cutoff), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(db_1.tasks.createdById, userId), (0, drizzle_orm_1.sql) `exists (select 1 from ${db_1.taskAssignees} where ${db_1.taskAssignees.taskId} = ${db_1.tasks.id} and ${db_1.taskAssignees.userId} = ${userId})`)))
                    .orderBy((0, drizzle_orm_1.desc)(db_1.tasks.updatedAt))
                    .limit(40),
            ]);
            const projectsBySpace = new Map();
            for (const p of projectRows) {
                const list = projectsBySpace.get(p.spaceId) ?? [];
                list.push(p.name);
                projectsBySpace.set(p.spaceId, list);
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
            });
        }
        catch {
            return `Workspace ID: ${workspaceId}`;
        }
    }
    /**
     * Assemble an enriched summary input for a task (Plan §7.5): title, status,
     * priority and description plus recent activity, open subtasks, open blockers,
     * and recent comments — all read via TasksService. Bounded for token safety by
     * `formatTaskSummaryInput`.
     */
    async buildTaskSummaryInput(taskId) {
        const [[taskRow], activity, subtasks, blockers, comments] = await Promise.all([
            this.db
                .select({
                title: db_1.tasks.title,
                description: db_1.tasks.description,
                status: db_1.tasks.status,
                priority: db_1.tasks.priority,
            })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
                .limit(1),
            this.tasks.listActivity(taskId, 12),
            this.tasks.listSubtasks(taskId),
            this.tasks.getOpenBlockers(taskId),
            this.tasks.listComments(taskId),
        ]);
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
            comments: comments.map((cm) => ({
                author: cm.author?.displayName ?? cm.author?.email ?? null,
                body: cm.body ?? '',
            })),
        });
    }
    /**
     * Streaming task/project summary (Plan §7.5) — mirrors `chatStream`'s SSE
     * framing (`{delta}` / `[DONE]` / `{error}`) so the client renders tokens as
     * they arrive. Uses the same model as the non-streaming `summarize`.
     */
    async summarizeStream(content, type, res, ctx = {}) {
        await this.assertWithinRateLimit(ctx, new Date(), 'summarize');
        const systemPrompt = `You are a concise summarizer for Rundesk.
Write a clear summary of the given ${type} in plain text (3-5 sentences).
Focus on the key goals, current status, recent activity, and any blockers or risks.`;
        const reply = res;
        if (typeof reply.hijack === 'function')
            reply.hijack();
        const raw = reply.raw ?? reply;
        raw.setHeader('Content-Type', 'text/event-stream');
        raw.setHeader('Cache-Control', 'no-cache');
        raw.setHeader('Connection', 'keep-alive');
        raw.flushHeaders?.();
        try {
            const stream = this.claude.messages.stream({
                model: 'claude-haiku-4-5',
                max_tokens: 512,
                system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
                messages: [{ role: 'user', content: content || `(no ${type} content provided)` }],
            });
            for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    raw.write(`data: ${JSON.stringify({ delta: chunk.delta.text })}\n\n`);
                }
            }
            const final = await stream.finalMessage().catch(() => null);
            void this.recordUsage('summarize', 'claude-haiku-4-5', ctx, final?.usage?.input_tokens ?? 0, final?.usage?.output_tokens ?? 0);
            raw.write('data: [DONE]\n\n');
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'AI request failed';
            await this.recordFailure('summarize', 'claude-haiku-4-5', ctx, 'provider_error', message);
            raw.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        }
        finally {
            raw.end();
        }
    }
    // ─── Smart deadline suggestion ────────────────────────────────────────────
    async suggestDeadline(title, description, teamWorkload, ctx = {}) {
        const today = new Date().toISOString().split('T')[0];
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
        });
        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]+\}/);
        if (!jsonMatch) {
            const fallback = new Date();
            fallback.setDate(fallback.getDate() + 7);
            return { suggestedDate: fallback.toISOString().split('T')[0], reasoning: 'Default 7-day estimate' };
        }
        return JSON.parse(jsonMatch[0]);
    }
    /**
     * Compact current-workload signal for a task's assignees (Plan §7.4): each
     * assignee's count of open (non-closed, non-archived) tasks across the
     * workspace. Returns undefined when the task has no assignees so the deadline
     * prompt omits the line entirely.
     */
    async buildTeamWorkloadSignal(taskId) {
        const assignees = await this.db
            .select({ userId: db_1.taskAssignees.userId, name: (0, drizzle_orm_1.sql) `coalesce(${db_1.users.displayName}, ${db_1.users.email})` })
            .from(db_1.taskAssignees)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.taskAssignees.userId))
            .where((0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, taskId));
        if (assignees.length === 0)
            return undefined;
        const workspaceId = await this.resolveTaskWorkspaceId(taskId);
        if (!workspaceId)
            return undefined;
        const ids = assignees.map((a) => a.userId);
        const counts = await this.db
            .select({ userId: db_1.taskAssignees.userId, count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(db_1.taskAssignees)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(db_1.taskAssignees.userId, ids), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.sql) `${db_1.tasks.statusCategory} <> 'closed'`))
            .groupBy(db_1.taskAssignees.userId);
        const countByUser = new Map(counts.map((c) => [c.userId, c.count]));
        return formatTeamWorkload(assignees.map((a) => ({ name: a.name || 'Someone', open: countByUser.get(a.userId) ?? 0 })));
    }
    /** Assert the caller is a member of the workspace (used by the suggestions endpoint). */
    async assertWorkspaceMember(workspaceId, userId) {
        const role = await this.memberRole(workspaceId, userId);
        if (!role)
            throw new common_1.ForbiddenException('You do not have access to this workspace');
    }
    /*
     * §G02 — the thumbs under a palette answer.
     *
     * Keyed on the normalised question rather than on a message id, because a
     * palette answer is never persisted as a message. See the schema comment on
     * `ai_answer_feedback` for why that trade is the right way round.
     */
    static normalizeQuestion(question) {
        return question.trim().toLowerCase().slice(0, 500);
    }
    async getAnswerFeedback(workspaceId, userId, question) {
        const q = AiService_1.normalizeQuestion(question);
        if (!q)
            return null;
        const [row] = await this.db
            .select({ rating: db_1.aiAnswerFeedback.rating })
            .from(db_1.aiAnswerFeedback)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.aiAnswerFeedback.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.aiAnswerFeedback.userId, userId), (0, drizzle_orm_1.eq)(db_1.aiAnswerFeedback.question, q)))
            .limit(1);
        return row?.rating === 'up' || row?.rating === 'down' ? row.rating : null;
    }
    /**
     * Set, flip or clear. Pressing the thumb that is already lit clears it —
     * the same convention `chat-threads.controller.ts` uses, so the two feedback
     * controls in the product do not behave differently from each other.
     *
     * Returns the rating now in force, so the caller never has to guess what its
     * own click produced.
     */
    async setAnswerFeedback(workspaceId, userId, question, rating) {
        const q = AiService_1.normalizeQuestion(question);
        if (!q)
            return { feedback: null };
        const current = await this.getAnswerFeedback(workspaceId, userId, q);
        // No opinion is the absence of a row, not a third value, so clearing is a
        // delete — otherwise "unrated" and "rated null" become two states that read
        // the same and count differently.
        const next = rating === null || rating === current ? null : rating;
        const scope = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.aiAnswerFeedback.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.aiAnswerFeedback.userId, userId), (0, drizzle_orm_1.eq)(db_1.aiAnswerFeedback.question, q));
        if (next === null) {
            await this.db.delete(db_1.aiAnswerFeedback).where(scope);
            return { feedback: null };
        }
        await this.db
            .insert(db_1.aiAnswerFeedback)
            .values({ workspaceId, userId, question: q, rating: next })
            .onConflictDoUpdate({
            target: [db_1.aiAnswerFeedback.workspaceId, db_1.aiAnswerFeedback.userId, db_1.aiAnswerFeedback.question],
            set: { rating: next, updatedAt: new Date() },
        });
        return { feedback: next };
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
    get knowledgeCandidateCap() {
        const v = Number(this.config.get('KNOWLEDGE_CANDIDATE_CAP'));
        return Number.isFinite(v) && v > 0 ? Math.trunc(v) : 5000;
    }
    /**
     * Embed the question with the SAME embedder used at index-time (env-gated real
     * API or the deterministic local embedder). Falls back to the pure local
     * embedder if no EmbeddingService is injected (some unit-test constructions).
     */
    async embedQuestion(text) {
        if (this.embeddings)
            return (await this.embeddings.embed(text)).vector;
        return (0, embedding_1.embedText)(text);
    }
    /**
     * Retrieve the access-scoped, semantically-ranked hits that ground a knowledge
     * answer. Embeds the question, ranks the workspace's embeddings by cosine,
     * over-fetches the top candidates, then filters by container visibility.
     */
    async retrieveKnowledgeHits(workspaceId, userId, question, limit = 6) {
        const q = question.trim();
        if (!q)
            return [];
        const queryVec = await this.embedQuestion(q);
        if (queryVec.length === 0)
            return [];
        const rows = await this.db
            .select({
            sourceType: db_1.knowledgeEmbeddings.sourceType,
            sourceId: db_1.knowledgeEmbeddings.sourceId,
            title: db_1.knowledgeEmbeddings.title,
            url: db_1.knowledgeEmbeddings.url,
            embedding: db_1.knowledgeEmbeddings.embedding,
            dim: db_1.knowledgeEmbeddings.dim,
        })
            .from(db_1.knowledgeEmbeddings)
            .where((0, drizzle_orm_1.eq)(db_1.knowledgeEmbeddings.workspaceId, workspaceId))
            .limit(this.knowledgeCandidateCap);
        const ranked = rows
            // Only compare vectors of the same dimensionality as the query (guards a
            // mid-flight embedder switch from mis-ranking stale rows).
            .filter((r) => Array.isArray(r.embedding) && r.embedding.length === queryVec.length && r.dim === queryVec.length)
            .map((r) => ({ r, score: (0, embedding_1.cosineSimilarity)(queryVec, r.embedding) }))
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit * 3);
        const hits = ranked.map(({ r }) => ({
            id: `${r.sourceType}-${r.sourceId}`,
            entityType: r.sourceType,
            title: r.title,
            content: '',
            url: r.url,
        }));
        const accessible = await this.filterAccessibleHits(workspaceId, userId, hits);
        return accessible.slice(0, limit);
    }
    /**
     * Hydrate the (already access-filtered) top hits with their live source text,
     * so the model gets grounded context — the embeddings table stores only
     * title/url, not the body. Only used on the AI-answer path. Best-effort:
     * missing text just leaves the title as the citation.
     */
    async enrichKnowledgeContent(hits) {
        const taskIds = [];
        const docIds = [];
        const commentIds = [];
        const attachmentIds = [];
        const meetingIds = [];
        for (const h of hits) {
            const { type, rawId } = (0, knowledge_1.splitSearchId)(h.id);
            if (type === 'task')
                taskIds.push(rawId);
            else if (type === 'doc')
                docIds.push(rawId);
            else if (type === 'comment')
                commentIds.push(rawId);
            else if (type === 'attachment')
                attachmentIds.push(rawId);
            else if (type === 'meeting')
                meetingIds.push(rawId);
        }
        const [taskRows, docRows, commentRows, meetingRows] = await Promise.all([
            taskIds.length
                ? this.db.select({ id: db_1.tasks.id, text: db_1.tasks.description }).from(db_1.tasks).where((0, drizzle_orm_1.inArray)(db_1.tasks.id, taskIds))
                : Promise.resolve([]),
            docIds.length
                ? this.db.select({ id: db_1.docs.id, text: db_1.docs.plaintext }).from(db_1.docs).where((0, drizzle_orm_1.inArray)(db_1.docs.id, docIds))
                : Promise.resolve([]),
            commentIds.length
                ? this.db.select({ id: db_1.taskComments.id, text: db_1.taskComments.body }).from(db_1.taskComments).where((0, drizzle_orm_1.inArray)(db_1.taskComments.id, commentIds))
                : Promise.resolve([]),
            /*
             * §G14-15 — the notes, which are the whole point of citing a meeting.
             *
             * Without this branch a meeting reaches the model as a bare title, and a
             * heading like "Weekly sync" grounds nothing: the answer would cite a
             * meeting it had not actually read.
             */
            meetingIds.length
                ? this.db.select({ id: db_1.meetings.id, text: db_1.meetings.notes }).from(db_1.meetings).where((0, drizzle_orm_1.inArray)(db_1.meetings.id, meetingIds))
                : Promise.resolve([]),
        ]);
        const byId = new Map();
        for (const r of [...taskRows, ...docRows, ...commentRows, ...meetingRows])
            byId.set(r.id, r.text ?? '');
        // Attachment bodies live in R2, not the DB — re-read + extract their text for
        // the top hits so the model can answer FROM attachment contents. Best-effort
        // and R2-gated: unconfigured storage or a missing/unreadable object just
        // leaves the filename as the citation (never throws on the answer path).
        if (attachmentIds.length > 0 && this.r2?.configured) {
            const r2 = this.r2;
            const attachmentRows = await this.db
                .select({
                id: db_1.taskAttachments.id,
                storageKey: db_1.taskAttachments.storageKey,
                contentType: db_1.taskAttachments.contentType,
            })
                .from(db_1.taskAttachments)
                .where((0, drizzle_orm_1.inArray)(db_1.taskAttachments.id, attachmentIds));
            await Promise.all(attachmentRows
                .filter((a) => (0, attachment_text_1.isExtractableAttachment)(a.contentType))
                .map(async (a) => {
                try {
                    const bytes = await r2.getObject(a.storageKey);
                    const text = (0, attachment_text_1.extractAttachmentText)(bytes, a.contentType, attachment_text_1.ATTACHMENT_TEXT_CAP);
                    if (text)
                        byId.set(a.id, text);
                }
                catch {
                    // best-effort — leave the citation as the filename
                }
            }));
        }
        return hits.map((h) => {
            const { rawId } = (0, knowledge_1.splitSearchId)(h.id);
            const text = byId.get(rawId);
            return text ? { ...h, content: text } : h;
        });
    }
    /**
     * Drop hits the caller isn't allowed to see. Workspace managers see
     * everything (mirrors SpacesService); everyone else is restricted to public
     * spaces/projects plus the private ones they're an explicit member of. User,
     * channel, and chat-message hits are already access-scoped by SearchService
     * and pass through unchanged.
     */
    async filterAccessibleHits(workspaceId, userId, hits) {
        if (hits.length === 0)
            return [];
        if (await (0, container_access_guard_helper_1.isWorkspaceManager)(this.db, workspaceId, userId))
            return hits;
        const taskIds = [];
        const commentIds = [];
        const docIds = [];
        const attachmentIds = [];
        for (const h of hits) {
            const { type, rawId } = (0, knowledge_1.splitSearchId)(h.id);
            if (type === 'task')
                taskIds.push(rawId);
            else if (type === 'comment')
                commentIds.push(rawId);
            else if (type === 'doc')
                docIds.push(rawId);
            else if (type === 'attachment')
                attachmentIds.push(rawId);
        }
        // Predicates matching common/permissions/container-access: a private space
        // needs space membership; an explicitly-private project needs project
        // membership. (Conservative — never surfaces content the caller can't see.)
        const memberSpaces = this.db
            .select({ id: db_1.spaceMembers.spaceId })
            .from(db_1.spaceMembers)
            .where((0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, userId));
        const memberProjects = this.db
            .select({ id: db_1.projectMembers.projectId })
            .from(db_1.projectMembers)
            .where((0, drizzle_orm_1.eq)(db_1.projectMembers.userId, userId));
        const spaceOk = (0, drizzle_orm_1.or)((0, drizzle_orm_1.ne)(db_1.spaces.visibility, 'private'), (0, drizzle_orm_1.inArray)(db_1.spaces.id, memberSpaces));
        const projectOk = (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(db_1.projects.visibility), (0, drizzle_orm_1.ne)(db_1.projects.visibility, 'private'), (0, drizzle_orm_1.inArray)(db_1.projects.id, memberProjects));
        const [okTasks, okComments, okDocs, okAttachments] = await Promise.all([
            taskIds.length
                ? this.db
                    .select({ id: db_1.tasks.id })
                    .from(db_1.tasks)
                    .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                    .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                    .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                    // Per-item task privacy (§2): on top of container access, drop a task
                    // hit for a private task the caller didn't create / isn't assigned to.
                    // We are past the manager early-return above, so isManager is false.
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.tasks.id, taskIds), spaceOk, projectOk, (0, item_visibility_1.taskVisibilityFilter)(this.db, userId, false)))
                : Promise.resolve([]),
            commentIds.length
                ? this.db
                    .select({ id: db_1.taskComments.id })
                    .from(db_1.taskComments)
                    .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskComments.taskId))
                    .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                    .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                    .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.taskComments.id, commentIds), spaceOk, projectOk))
                : Promise.resolve([]),
            docIds.length
                ? this.db
                    .select({ id: db_1.docs.id })
                    .from(db_1.docs)
                    .leftJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.docs.spaceId))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.docs.id, docIds), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(db_1.docs.spaceId), (0, drizzle_orm_1.ne)(db_1.spaces.visibility, 'private'), (0, drizzle_orm_1.inArray)(db_1.spaces.id, memberSpaces))))
                : Promise.resolve([]),
            // An attachment inherits its parent task's container access: gate it by
            // the SAME space/project visibility as the task it hangs off (join
            // attachment → task → list → project → space). Without this branch an
            // attachment hit would fall through to the `return true` default below and
            // leak content from a private space/project the caller can't reach.
            attachmentIds.length
                ? this.db
                    .select({ id: db_1.taskAttachments.id })
                    .from(db_1.taskAttachments)
                    .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAttachments.taskId))
                    .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                    .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                    .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.taskAttachments.id, attachmentIds), spaceOk, projectOk))
                : Promise.resolve([]),
        ]);
        const okTaskSet = new Set(okTasks.map((r) => r.id));
        const okCommentSet = new Set(okComments.map((r) => r.id));
        const okDocSet = new Set(okDocs.map((r) => r.id));
        const okAttachmentSet = new Set(okAttachments.map((r) => r.id));
        return hits.filter((h) => {
            const { type, rawId } = (0, knowledge_1.splitSearchId)(h.id);
            if (type === 'task')
                return okTaskSet.has(rawId);
            if (type === 'comment')
                return okCommentSet.has(rawId);
            if (type === 'doc')
                return okDocSet.has(rawId);
            if (type === 'attachment')
                return okAttachmentSet.has(rawId);
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
            if (type === 'meeting')
                return true;
            // user / channel / message — already scoped by SearchService.
            return true;
        });
    }
    /**
     * Answer a natural-language question about the workspace, grounded in the
     * caller's accessible content. Uses the model (Sonnet) with a cited context
     * when available; otherwise returns the ranked matches with a "matches found"
     * message. Always returns the access-scoped `sources`; never fabricates.
     */
    async answerKnowledge(workspaceId, userId, question, ctx = {}) {
        const hits = await this.retrieveKnowledgeHits(workspaceId, userId, question);
        const sources = hits.map(knowledge_1.hitToSource);
        // No vector matches the caller can see → deterministic no-match, no model
        // call, no fabrication.
        if (sources.length === 0) {
            return { answer: (0, knowledge_1.deterministicKnowledgeAnswer)(question, sources), sources, source: 'fallback' };
        }
        // Vector matches found but the model is unavailable → report them
        // deterministically (source: 'vector').
        if (!this.isAvailable()) {
            return { answer: (0, knowledge_1.deterministicKnowledgeAnswer)(question, sources), sources, source: 'vector' };
        }
        try {
            const context = (0, knowledge_1.assembleKnowledgeContext)(await this.enrichKnowledgeContent(hits));
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
            });
            const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
            if (!text)
                return { answer: (0, knowledge_1.deterministicKnowledgeAnswer)(question, sources), sources, source: 'vector' };
            return { answer: text, sources, source: 'ai' };
        }
        catch {
            // AI unavailable / rate-limited / malformed — degrade to the vector matches.
            return { answer: (0, knowledge_1.deterministicKnowledgeAnswer)(question, sources), sources, source: 'vector' };
        }
    }
    // ─── §14.4 AI-powered Help Center ─────────────────────────────────────────
    /**
     * Answer a product/how-to question grounded in the curated help/FAQ knowledge
     * base (`HELP_TOPICS`). Uses the model (Haiku) when available; otherwise —
     * the deterministic fallback — returns the closest FAQ topic by keyword match.
     * Always returns the relevant FAQ entries as `sources`.
     */
    async answerHelp(question, ctx = {}) {
        const matches = (0, knowledge_1.matchHelpTopics)(question);
        // Cite the closest FAQ entries; when nothing matched, offer the top topics.
        const cited = matches.length ? matches : knowledge_1.HELP_TOPICS.slice(0, 3);
        const sources = cited.map(knowledge_1.helpTopicToSource);
        const closestAnswer = matches.length ? matches[0].answer : knowledge_1.HELP_NO_MATCH;
        if (!this.isAvailable()) {
            return { answer: closestAnswer, sources, source: 'faq' };
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
${(0, knowledge_1.formatHelpKnowledgeBase)()}`,
                messages: [{ role: 'user', content: question.trim() }],
            });
            const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
            if (!text)
                return { answer: closestAnswer, sources, source: 'faq' };
            return { answer: text, sources, source: 'ai' };
        }
        catch {
            return { answer: closestAnswer, sources, source: 'faq' };
        }
    }
    // ─── AI-suggested automation rules (Plan §7.7) ────────────────────────────
    /**
     * Suggest 2-4 automation rules from recent workspace behavior (status
     * transitions, overdue pressure, active assignees, comment volume). Uses the
     * model when configured; otherwise — or on any AI error, including rate limits
     * — returns a deterministic heuristic. Never throws: always best-effort.
     */
    async suggestAutomations(workspaceId, ctx = {}) {
        const behavior = await this.collectAutomationBehavior(workspaceId);
        const fallback = deterministicAutomationSuggestions(behavior);
        if (!this.isAvailable())
            return { source: 'heuristic', suggestions: fallback };
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
            });
            const text = response.content[0].type === 'text' ? response.content[0].text : '';
            const match = text.match(/\[[\s\S]*\]/);
            const parsed = match ? sanitizeAutomationSuggestions(safeJsonParse(match[0])) : [];
            return parsed.length ? { source: 'ai', suggestions: parsed.slice(0, 4) } : { source: 'heuristic', suggestions: fallback };
        }
        catch {
            // AI unavailable / rate-limited / malformed — degrade to the heuristic.
            return { source: 'heuristic', suggestions: fallback };
        }
    }
    /** Read recent workspace behavior stats used to ground automation suggestions. */
    async collectAutomationBehavior(workspaceId) {
        const since = new Date(Date.now() - 30 * 24 * 3_600_000);
        const now = new Date();
        const [transitions, overdue, assignees, comments, openTasks] = await Promise.all([
            this.db
                .select({
                from: (0, drizzle_orm_1.sql) `coalesce(${db_1.taskActivity.meta}->>'from','')`,
                to: (0, drizzle_orm_1.sql) `coalesce(${db_1.taskActivity.meta}->>'to','')`,
                count: (0, drizzle_orm_1.sql) `count(*)::int`,
            })
                .from(db_1.taskActivity)
                .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskActivity.taskId))
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskActivity.action, 'status_changed'), (0, drizzle_orm_1.gte)(db_1.taskActivity.createdAt, since)))
                .groupBy((0, drizzle_orm_1.sql) `${db_1.taskActivity.meta}->>'from'`, (0, drizzle_orm_1.sql) `${db_1.taskActivity.meta}->>'to'`)
                .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `count(*)`))
                .limit(6),
            this.db
                .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(db_1.tasks)
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.lte)(db_1.tasks.dueDate, now), (0, drizzle_orm_1.sql) `${db_1.tasks.statusCategory} <> 'closed'`)),
            this.db
                .select({ name: (0, drizzle_orm_1.sql) `coalesce(${db_1.users.displayName}, ${db_1.users.email})`, count: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(db_1.taskAssignees)
                .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.taskAssignees.userId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.sql) `${db_1.tasks.statusCategory} <> 'closed'`))
                .groupBy(db_1.users.id, db_1.users.displayName, db_1.users.email)
                .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `count(*)`))
                .limit(5),
            this.db
                .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(db_1.taskActivity)
                .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskActivity.taskId))
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskActivity.action, 'commented'), (0, drizzle_orm_1.gte)(db_1.taskActivity.createdAt, since))),
            this.db
                .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(db_1.tasks)
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.sql) `${db_1.tasks.statusCategory} <> 'closed'`)),
        ]);
        return {
            totalOpenTasks: openTasks[0]?.count ?? 0,
            overdueCount: overdue[0]?.count ?? 0,
            statusTransitions: transitions
                .filter((t) => t.to)
                .map((t) => ({ from: t.from || '(none)', to: t.to, count: t.count })),
            topAssignees: assignees.map((a) => ({ name: a.name || 'Someone', count: a.count })),
            commentActivityCount: comments[0]?.count ?? 0,
        };
    }
    isAvailable() {
        return this.client !== null;
    }
    // ─── Agentic AI commands (Plan §7.6 / §7.8) ───────────────────────────────
    /** Membership role for (workspace, user), or null when not a member. */
    async memberRole(workspaceId, userId) {
        const [row] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        return row?.role ?? null;
    }
    async resolveListWorkspaceId(listId) {
        const [row] = await this.db
            .select({ workspaceId: db_1.spaces.workspaceId })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
            .limit(1);
        return row?.workspaceId ?? null;
    }
    async resolveTaskWorkspaceId(taskId) {
        const [row] = await this.db
            .select({ workspaceId: db_1.spaces.workspaceId })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        return row?.workspaceId ?? null;
    }
    /**
     * Assert the user may read a task's workspace (Plan §7.5 hardening). Reused by
     * the `/ai/summarize` taskId path so any authed user can no longer summarize an
     * arbitrary task by id.
     */
    async assertTaskWorkspaceAccess(taskId, userId) {
        const workspaceId = await this.resolveTaskWorkspaceId(taskId);
        if (!workspaceId)
            throw new common_1.NotFoundException('Task not found');
        const role = await this.memberRole(workspaceId, userId);
        if (!role)
            throw new common_1.ForbiddenException('You do not have access to this task');
    }
    /**
     * Load the bounded, DB-resolved context the command planner needs: destination
     * lists (with paths), workspace members (for assigneeEmail→userId), and the
     * open tasks (with assignee emails) that search / bulk filters run against.
     */
    async loadCommandContext(workspaceId, actorId, actorRole) {
        // Per-item privacy (§2): a non-manager caller must not see private tasks/lists
        // they don't own (or, for tasks, aren't assigned to). Managers are unrestricted.
        const isManager = actorId ? await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, actorId, actorRole) : false;
        const today = new Date().toISOString().slice(0, 10);
        const [listRows, memberRows, taskRows] = await Promise.all([
            this.db
                .select({ id: db_1.lists.id, name: db_1.lists.name, projectName: db_1.projects.name, spaceName: db_1.spaces.name })
                .from(db_1.lists)
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.lists.isArchived, false), (0, item_visibility_1.listVisibilityFilter)(actorId, isManager)))
                .orderBy((0, drizzle_orm_1.asc)(db_1.spaces.name), (0, drizzle_orm_1.asc)(db_1.projects.name), (0, drizzle_orm_1.asc)(db_1.lists.name))
                .limit(100),
            this.db
                .select({ userId: db_1.users.id, email: db_1.users.email, displayName: db_1.users.displayName })
                .from(db_1.workspaceMembers)
                .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
                .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId)),
            this.db
                .select({
                id: db_1.tasks.id,
                title: db_1.tasks.title,
                listId: db_1.tasks.listId,
                status: db_1.tasks.status,
                statusCategory: db_1.tasks.statusCategory,
                dueDate: db_1.tasks.dueDate,
            })
                .from(db_1.tasks)
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, item_visibility_1.taskVisibilityFilter)(this.db, actorId, isManager)))
                .orderBy((0, drizzle_orm_1.asc)(db_1.tasks.dueDate))
                .limit(300),
        ]);
        const taskIds = taskRows.map((t) => t.id);
        const assigneeRows = taskIds.length
            ? await this.db
                .select({ taskId: db_1.taskAssignees.taskId, email: db_1.users.email })
                .from(db_1.taskAssignees)
                .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.taskAssignees.userId))
                .where((0, drizzle_orm_1.inArray)(db_1.taskAssignees.taskId, taskIds))
            : [];
        const emailsByTask = new Map();
        for (const row of assigneeRows) {
            const list = emailsByTask.get(row.taskId) ?? [];
            list.push(row.email);
            emailsByTask.set(row.taskId, list);
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
                statusCategory: t.statusCategory,
                dueDate: toDayString(t.dueDate) || null,
                assigneeEmails: emailsByTask.get(t.id) ?? [],
            })),
        };
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
    async proposeSkill(workspaceId, userId, request, ctx = {}, 
    /**
     * Called as each lookup finishes, so the caller can show the work.
     *
     * A step is emitted only once its lookup has actually returned. The
     * alternative — a client animating a hardcoded list of labels — would look
     * identical on a good day and lie on a bad one, and it is precisely on the
     * bad day that someone needs to know what was and was not read.
     */
    onStep) {
        const steps = [];
        const step = (s) => {
            steps.push(s);
            onStep?.(s);
        };
        const [workspaceContext, personal, existing] = await Promise.all([
            this.buildWorkspaceContext(workspaceId, userId),
            this.db
                .select({ n: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(db_1.personalTasks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.personalTasks.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.personalTasks.userId, userId))),
            this.db
                .select({ name: db_1.skills.name })
                .from(db_1.skills)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.skills.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.skills.createdById, userId)))
                .limit(20),
        ]);
        step({
            label: "Checking what you're working on",
            finding: workspaceContext.split('\n').find((l) => l.startsWith('Workspace:')) ?? undefined,
        });
        const personalCount = personal[0]?.n ?? 0;
        step({
            label: 'Mapping your task habits',
            // The number, not an adjective: "mostly empty" is the model's call to make
            // from a real count, not ours to assert on its behalf.
            finding: `${personalCount} item(s) on your personal list`,
        });
        const owned = existing.map((r) => r.name);
        step({
            label: 'Checking the skills you already have',
            finding: owned.length ? owned.join(', ') : 'none yet',
        });
        if (!this.isAvailable()) {
            const proposal = (0, skill_proposal_1.fallbackProposal)(request, steps);
            return { proposal, message: (0, skill_proposal_1.renderProposal)(proposal) };
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
        });
        const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
        // A draft that cannot be parsed falls back to one built from the request —
        // never to a half-populated skill, which would look authored and be empty.
        const proposal = (0, skill_proposal_1.parseSkillProposal)(text, steps) ?? (0, skill_proposal_1.fallbackProposal)(request, steps);
        return { proposal, message: (0, skill_proposal_1.renderProposal)(proposal) };
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
    async mineSkills(workspaceId, userId, ctx = {}, onStep) {
        const steps = [];
        const step = (v) => {
            steps.push(v);
            onStep?.(v);
        };
        const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const [myTasks, myDocs, existing] = await Promise.all([
            // Tasks this person created — what they repeatedly set up is the
            // strongest signal of a workflow they run.
            this.db
                .select({ title: db_1.tasks.title })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.createdById, userId), (0, drizzle_orm_1.gte)(db_1.tasks.createdAt, since)))
                .orderBy((0, drizzle_orm_1.desc)(db_1.tasks.createdAt))
                .limit(120),
            this.db
                .select({ title: db_1.docs.title })
                .from(db_1.docs)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.docs.createdById, userId)))
                .orderBy((0, drizzle_orm_1.desc)(db_1.docs.createdAt))
                .limit(60),
            this.db
                .select({ name: db_1.skills.name })
                .from(db_1.skills)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.skills.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.skills.createdById, userId)))
                .limit(20),
        ]);
        step({ label: 'Reading the tasks you set up', finding: `${myTasks.length} in the last 90 days` });
        step({ label: 'Reading the docs you wrote', finding: `${myDocs.length}` });
        const owned = existing.map((r) => r.name);
        step({
            label: 'Checking what you have already turned into a skill',
            finding: owned.length ? owned.join(', ') : 'nothing yet',
        });
        // Too little to find repetition in. Saying so beats asking a model to find
        // a pattern in four task titles and dressing up whatever it returns.
        if (myTasks.length + myDocs.length < 8 || !this.isAvailable()) {
            return { skills: [], message: (0, skill_proposal_1.noPatternsFound)(steps) };
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
        });
        const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
        const mined = (0, skill_proposal_1.parseMinedSkills)(text, steps);
        return {
            skills: mined,
            message: mined.length
                ? `I read ${myTasks.length} task(s) and ${myDocs.length} doc(s) you made, and found ${mined.length} workflow(s) worth saving.`
                : (0, skill_proposal_1.noPatternsFound)(steps),
        };
    }
    /**
     * §15 — name a chat from what it is about, frames `296_1817` → `297_1820`.
     *
     * Returns '' when no model is configured rather than inventing something:
     * the caller has a deterministic fallback built from the first question,
     * which is a better name than anything guessed here.
     */
    async titleForChat(messages, ctx = {}) {
        if (!this.isAvailable() || messages.length === 0)
            return '';
        const transcript = messages
            .slice(0, 6)
            .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
            .join('\n');
        const response = await this.complete('chat.title', ctx, {
            // The cheap model on purpose: this is a three-word heading, and running
            // it on the expensive one would cost real money per conversation for no
            // difference anyone could see.
            model: 'claude-haiku-4-5',
            max_tokens: 40,
            system: 'Name this conversation in 2-5 words, like a heading in a sidebar. ' +
                'Reply with ONLY the title — no quotes, no punctuation at the end, no explanation.',
            messages: [{ role: 'user', content: transcript }],
        });
        return response.content[0]?.type === 'text' ? response.content[0].text : '';
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
    async askAboutMeetings(question, meetingsContext, ctx = {}) {
        if (meetingsContext.length === 0) {
            return {
                answer: 'There are no meetings recorded here yet, so there is nothing for me to read. ' +
                    'Record one from the AI panel’s Meeting notes tab and ask me again.',
                grounded: false,
            };
        }
        if (!this.isAvailable()) {
            return {
                answer: `I can see ${meetingsContext.length} meeting(s), but no model is configured on this instance, so I cannot read them for you.`,
                grounded: false,
            };
        }
        const transcript = meetingsContext
            .map((m) => {
            const when = m.startsAt ? new Date(m.startsAt).toISOString().split('T')[0] : 'no date';
            const who = m.attendees.length ? ` — with ${m.attendees.join(', ')}` : '';
            return `## ${m.title} (${when})${who}\n${m.notes ?? '(no notes were kept)'}`;
        })
            .join('\n\n');
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
        });
        const answer = response.content[0]?.type === 'text' ? response.content[0].text : '';
        return { answer, grounded: true };
    }
    async command(workspaceId, message, ctx = {}) {
        const [workspaceContext, planCtx] = await Promise.all([
            this.buildWorkspaceContext(workspaceId, ctx.userId ?? ''),
            this.loadCommandContext(workspaceId, ctx.userId ?? ''),
        ]);
        const listCatalog = planCtx.lists
            .slice(0, 60)
            .map((l) => `- ${l.id}: ${l.path}`)
            .join('\n');
        const systemPrompt = `You are Rundesk's command assistant. Translate the user's natural-language request into tool calls.
Today's date is ${planCtx.today}.
Use search_tasks (READ-ONLY) to locate task ids before proposing changes; reference tasks by their id.
For any change (create_task / set_task_status / reschedule_task / assign_task / bulk_reschedule) call the matching tool. Changes are PREVIEWED for the user to confirm and are NOT executed until they confirm — do not claim you have already made a change.
When creating a task, pick a listId from "Available lists". Resolve people by their email.

Workspace context:
${workspaceContext}

Available lists (id: path):
${listCatalog || '(none)'}`;
        const messages = [{ role: 'user', content: message }];
        const collected = [];
        // Bounded agentic loop: keep going while the model only searches (so it can
        // act on the results), and stop as soon as it proposes any mutation.
        for (let turn = 0; turn < 5; turn++) {
            const response = await this.complete('command', ctx, {
                model: 'claude-sonnet-4-6',
                max_tokens: 1024,
                system: systemPrompt,
                tools: ai_command_1.COMMAND_TOOLS,
                messages,
            });
            const toolUses = response.content.filter((block) => block.type === 'tool_use');
            if (toolUses.length === 0)
                break;
            messages.push({ role: 'assistant', content: response.content });
            const toolResults = [];
            let hasMutation = false;
            for (const toolUse of toolUses) {
                const input = (toolUse.input ?? {});
                collected.push({ name: toolUse.name, input });
                if (toolUse.name === 'search_tasks') {
                    const found = (0, ai_command_1.searchTasksInContext)(input, planCtx)
                        .slice(0, 25)
                        .map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, assigneeEmails: t.assigneeEmails }));
                    toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(found) });
                }
                else {
                    hasMutation = true;
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: 'Queued for the user to confirm (not executed).',
                    });
                }
            }
            messages.push({ role: 'user', content: toolResults });
            if (hasMutation)
                break;
        }
        // Deterministic plan (Plan §7.6): honest summary + resolved actions built
        // purely from the collected tool calls, so the preview never over-claims.
        return (0, ai_command_1.planFromToolCalls)(collected, planCtx);
    }
    /**
     * Execute confirmed actions via TasksService (Plan §7.6). Each mutation is
     * access-checked (TasksService enforces task write permission; create_task
     * verifies non-guest workspace membership) — actions the caller can't perform
     * are skipped and reported rather than failing the batch. TasksService already
     * audits each mutation via its activity log.
     */
    async executeActions(actions, userId) {
        const results = [];
        for (const action of actions) {
            try {
                results.push(await this.executeOne(action, userId));
            }
            catch (err) {
                const skippable = err instanceof common_1.ForbiddenException || err instanceof common_1.NotFoundException || err instanceof common_1.BadRequestException;
                const reason = err instanceof common_1.ForbiddenException ? 'no_permission' : err instanceof Error ? err.message : 'error';
                results.push({
                    tool: action.tool,
                    humanLabel: action.humanLabel,
                    status: skippable ? 'skipped' : 'failed',
                    reason,
                    affectedTaskIds: action.affectedTaskIds,
                });
            }
        }
        return { results };
    }
    async executeOne(action, userId) {
        switch (action.tool) {
            case 'create_task': {
                const workspaceId = await this.resolveListWorkspaceId(action.args.listId);
                if (!workspaceId) {
                    return { tool: action.tool, humanLabel: action.humanLabel, status: 'skipped', reason: 'List not found' };
                }
                const role = await this.memberRole(workspaceId, userId);
                if (!role || role === 'guest') {
                    return { tool: action.tool, humanLabel: action.humanLabel, status: 'skipped', reason: 'no_permission' };
                }
                // Only assign a resolved assignee that is actually a member of this workspace.
                let assigneeIds;
                if (action.args.assigneeId && (await this.memberRole(workspaceId, action.args.assigneeId))) {
                    assigneeIds = [action.args.assigneeId];
                }
                const created = await this.tasks.createTask({
                    listId: action.args.listId,
                    title: action.args.title,
                    description: action.args.description,
                    priority: action.args.priority,
                    dueDate: action.args.dueDate ? new Date(action.args.dueDate) : undefined,
                    assigneeIds,
                    createdById: userId,
                });
                return {
                    tool: action.tool,
                    humanLabel: action.humanLabel,
                    status: 'succeeded',
                    affectedTaskIds: created ? [created.id] : [],
                };
            }
            case 'set_task_status': {
                await this.tasks.updateTask(action.args.taskId, userId, { status: action.args.status });
                return { tool: action.tool, humanLabel: action.humanLabel, status: 'succeeded', affectedTaskIds: action.affectedTaskIds };
            }
            case 'reschedule_task': {
                await this.tasks.updateTask(action.args.taskId, userId, { dueDate: new Date(action.args.dueDate) });
                return { tool: action.tool, humanLabel: action.humanLabel, status: 'succeeded', affectedTaskIds: action.affectedTaskIds };
            }
            case 'assign_task': {
                // Guard against a tampered assigneeId: only assign an actual member.
                const workspaceId = await this.resolveTaskWorkspaceId(action.args.taskId);
                if (workspaceId && !(await this.memberRole(workspaceId, action.args.assigneeId))) {
                    return { tool: action.tool, humanLabel: action.humanLabel, status: 'skipped', reason: 'Assignee is not a workspace member' };
                }
                await this.tasks.addAssignee(action.args.taskId, action.args.assigneeId, userId);
                return { tool: action.tool, humanLabel: action.humanLabel, status: 'succeeded', affectedTaskIds: action.affectedTaskIds };
            }
            case 'bulk_reschedule': {
                const res = await this.tasks.bulkUpdateTasks(action.args.taskIds, userId, { dueDate: new Date(action.args.dueDate) });
                const status = res.updatedCount > 0 ? 'succeeded' : 'skipped';
                const reason = res.failedCount > 0
                    ? res.updatedCount > 0
                        ? `${res.updatedCount} updated, ${res.failedCount} skipped`
                        : 'no_permission'
                    : undefined;
                return { tool: action.tool, humanLabel: action.humanLabel, status, reason, affectedTaskIds: action.args.taskIds };
            }
        }
    }
    // ─── Workspace insights (real AI over real metrics) ───────────────────────
    async generateInsights(context, ctx = {}) {
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
        });
        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]+\}/);
        if (!jsonMatch) {
            return { summary: 'Insights are unavailable right now.', health: { score: 0, label: 'steady', reasoning: '' }, suggestions: [] };
        }
        return JSON.parse(jsonMatch[0]);
    }
    // ─── Dashboard layout suggestion (real AI) ────────────────────────────────
    async suggestDashboardLayout(availableWidgets, context, ctx = {}) {
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
        });
        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]+\}/);
        if (!jsonMatch)
            return { widgets: availableWidgets.map((w) => w.type).slice(0, 5), reasoning: '' };
        const parsed = JSON.parse(jsonMatch[0]);
        const valid = new Set(availableWidgets.map((w) => w.type));
        const widgets = Array.isArray(parsed.widgets) ? parsed.widgets.filter((w) => typeof w === 'string' && valid.has(w)) : [];
        return { widgets: widgets.length ? widgets : availableWidgets.map((w) => w.type).slice(0, 5), reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '' };
    }
    // ─── Comment sentiment for project health (Plan §7.13) ────────────────────
    /**
     * Gauge team sentiment from a project's recent task comments (Plan §7.13).
     * Uses the model (haiku) when configured; otherwise — or on any AI error /
     * malformed output — falls back to the deterministic keyword classifier.
     * Never throws so the daily health cron can always fold in a sentiment score.
     */
    async analyzeCommentSentiment(texts, ctx = {}) {
        const fallback = analyzeSentimentDeterministic(texts);
        if (fallback.samples === 0 || !this.isAvailable())
            return fallback;
        try {
            const sample = texts
                .filter((t) => (t ?? '').trim())
                .slice(0, 40)
                .map((t, i) => `${i + 1}. ${truncate(t, 200)}`)
                .join('\n');
            const response = await this.complete('project.sentiment', ctx, {
                model: 'claude-haiku-4-5',
                max_tokens: 256,
                system: `You gauge team sentiment from task comments for a project-health score.
Respond ONLY with valid JSON: { "score": 0-100 integer (0 very negative, 50 neutral, 100 very positive), "label": "positive|neutral|negative" }.`,
                messages: [{ role: 'user', content: `Recent comments:\n${sample}` }],
            });
            const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
            const parsed = safeJsonParse((text.match(/\{[\s\S]*\}/) ?? [''])[0]);
            const score = parsed && Number.isFinite(Number(parsed.score)) ? Math.max(0, Math.min(100, Math.round(Number(parsed.score)))) : null;
            if (score === null)
                return fallback;
            const label = score >= 60 ? 'positive' : score <= 40 ? 'negative' : 'neutral';
            return { score, label, positive: fallback.positive, negative: fallback.negative, samples: fallback.samples, source: 'ai' };
        }
        catch {
            return fallback;
        }
    }
    // ─── Daily briefing generation (Plan §7.11) ───────────────────────────────
    /**
     * Generate a short daily briefing (Plan §7.11). Uses the model (haiku) when
     * configured; otherwise — or on any AI error — returns the deterministic
     * template. Never throws: always best-effort so the cron can always deliver.
     */
    async generateBriefing(data, ctx = {}) {
        const fallback = formatBriefingFallback(data);
        if (!this.isAvailable())
            return fallback;
        try {
            const lines = [
                `Name: ${data.displayName || 'teammate'}`,
                `Overdue (${data.overdue.length}): ${data.overdue.slice(0, 8).join('; ') || 'none'}`,
                `Blocking others (${data.blocking.length}): ${data.blocking.slice(0, 8).join('; ') || 'none'}`,
                `Due today (${data.dueToday.length}): ${data.dueToday.slice(0, 8).join('; ') || 'none'}`,
                `At risk soon (${data.atRisk.length}): ${data.atRisk.slice(0, 8).join('; ') || 'none'}`,
            ].join('\n');
            const response = await this.complete('daily.briefing', ctx, {
                model: 'claude-haiku-4-5',
                max_tokens: 400,
                system: `You are Rundesk's daily briefing assistant. Write a warm, concise morning briefing (2-4 sentences, plain text) that leads with what is most urgent (overdue, then tasks blocking others, then due-today, then at-risk). Address the person by their first name. Do not invent tasks beyond those provided.`,
                messages: [{ role: 'user', content: `Here is my work for today:\n${lines}` }],
            });
            const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
            return text || fallback;
        }
        catch {
            return fallback;
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
    async generateStandup(data, ctx = {}) {
        const fallback = (0, standup_1.formatStandupFallback)(data);
        if (!this.isAvailable())
            return fallback;
        try {
            const titles = (rows) => rows.slice(0, 8).map((r) => r.title).join('; ') || 'none';
            const lines = [
                `Person: ${data.displayName || 'this teammate'}`,
                `Window: the last ${data.days} day(s)`,
                `Completed (${data.done.length}): ${titles(data.done)}`,
                `In progress (${data.active.length}): ${titles(data.active)}`,
                `Overdue (${data.overdue.length}): ${titles(data.overdue)}`,
                `Blocked by unfinished work (${data.blocked.length}): ${titles(data.blocked)}`,
            ].join('\n');
            const response = await this.complete('people.standup', ctx, {
                model: 'claude-haiku-4-5',
                max_tokens: 400,
                system: "You are Rundesk's standup writer. In 2-4 plain-text sentences, summarise what this person has been working on for a colleague reading their profile. " +
                    'Write in the third person and use their first name. Lead with completed work, then work in progress, then anything overdue or blocked. ' +
                    'Describe the work, never appraise the person, and never speculate about why something is late. ' +
                    'Use only the tasks listed — do not invent any, and do not pad the summary when a bucket is empty.',
                messages: [{ role: 'user', content: `Here is their work:\n${lines}` }],
            });
            const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
            return text || fallback;
        }
        catch {
            return fallback;
        }
    }
    // ─── Smart task suggestions (Plan §7.10) ──────────────────────────────────
    /** Ensure the caller is a manager/admin of the workspace (mutating AI actions). */
    async assertWorkspaceManager(workspaceId, userId) {
        const role = await this.memberRole(workspaceId, userId);
        if (!role || !['workspace_admin', 'manager', 'super_admin'].includes(role)) {
            throw new common_1.ForbiddenException('Only managers or admins can perform this action');
        }
    }
    /**
     * Suggest a task list for a project by learning from SIMILAR existing projects
     * in the workspace (Plan §7.10): rank candidates by name/keyword similarity,
     * summarize their task titles, and return the most-frequent titles as a
     * deterministic fallback; refine with the model (haiku) when configured. Never
     * throws — always best-effort so the UI can always render something.
     */
    async suggestTasks(input, ctx = {}) {
        const target = (input.projectName ?? '').trim() || (await this.resolveProjectName(input.projectId)) || 'this project';
        const candidates = await this.collectCandidateProjects(input.workspaceId, input.projectId);
        const similar = rankSimilarProjects(target, candidates);
        const basis = summarizeSuggestionBasis(similar);
        const fallback = deterministicTaskSuggestions(similar);
        if (!this.isAvailable())
            return { source: 'heuristic', suggestions: fallback, basis };
        try {
            const similarBlock = similar
                .filter((p) => p.taskTitles.length)
                .slice(0, 5)
                .map((p) => `Project "${p.name}":\n${p.taskTitles.slice(0, 15).map((t) => `- ${t}`).join('\n')}`)
                .join('\n\n');
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
            });
            const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
            const match = text.match(/\[[\s\S]*\]/);
            const parsed = match ? sanitizeTaskSuggestions(safeJsonParse(match[0])) : [];
            return parsed.length
                ? { source: 'ai', suggestions: parsed, basis }
                : { source: 'heuristic', suggestions: fallback, basis };
        }
        catch {
            return { source: 'heuristic', suggestions: fallback, basis };
        }
    }
    async resolveProjectName(projectId) {
        if (!projectId)
            return null;
        const [row] = await this.db.select({ name: db_1.projects.name }).from(db_1.projects).where((0, drizzle_orm_1.eq)(db_1.projects.id, projectId)).limit(1);
        return row?.name ?? null;
    }
    /** Workspace projects (excluding the target) with their bounded top-level task titles. */
    async collectCandidateProjects(workspaceId, excludeProjectId) {
        const projectRows = await this.db
            .select({ id: db_1.projects.id, name: db_1.projects.name })
            .from(db_1.projects)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.projects.createdAt))
            .limit(60);
        const ids = projectRows.map((p) => p.id).filter((id) => id !== excludeProjectId);
        if (ids.length === 0)
            return [];
        const taskRows = await this.db
            .select({ projectId: db_1.lists.projectId, title: db_1.tasks.title })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(db_1.lists.projectId, ids), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.isNull)(db_1.tasks.parentTaskId)))
            .limit(3000);
        const byProject = new Map();
        for (const r of taskRows) {
            const list = byProject.get(r.projectId) ?? [];
            if (list.length < 40)
                list.push(r.title);
            byProject.set(r.projectId, list);
        }
        return projectRows
            .filter((p) => p.id !== excludeProjectId)
            .map((p) => ({ id: p.id, name: p.name, taskTitles: byProject.get(p.id) ?? [] }));
    }
    // ─── Smart workload balancing (Plan §7.12) ────────────────────────────────
    /**
     * Per-member open-task load (non-archived, non-closed) across the workspace,
     * with each member's task ids ordered least-urgent-first so the tasks handed
     * off first are the safest to move. Reuses the workload report's join shape.
     */
    async collectWorkloadLoads(workspaceId) {
        const members = await this.db
            .select({
            userId: db_1.users.id,
            name: (0, drizzle_orm_1.sql) `coalesce(${db_1.users.displayName}, ${db_1.users.email})`,
        })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.ne)(db_1.workspaceMembers.role, 'guest')));
        const rows = await this.db
            .select({ userId: db_1.taskAssignees.userId, taskId: db_1.tasks.id, priority: db_1.tasks.priority, dueDate: db_1.tasks.dueDate })
            .from(db_1.taskAssignees)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.sql) `${db_1.tasks.statusCategory} <> 'closed'`));
        const prioRank = { urgent: 0, high: 1, normal: 2, low: 3 };
        const rank = (p) => prioRank[p ?? 'normal'] ?? 2;
        const sorted = rows.slice().sort((a, b) => {
            // Least urgent first, then furthest-out due date first (safest to reassign).
            const byPrio = rank(b.priority) - rank(a.priority);
            if (byPrio !== 0)
                return byPrio;
            const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
            const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
            return db - da;
        });
        const byUser = new Map();
        for (const r of sorted) {
            const list = byUser.get(r.userId) ?? [];
            list.push(r.taskId);
            byUser.set(r.userId, list);
        }
        return members.map((m) => {
            const taskIds = byUser.get(m.userId) ?? [];
            return { userId: m.userId, name: m.name || 'Someone', open: taskIds.length, taskIds };
        });
    }
    /**
     * Redistribution suggestions from real per-assignee open-task load (Plan §7.12).
     * Deterministic heuristic always available; refined by the model (haiku) when
     * configured, with task ids resolved server-side from the real loads.
     */
    async workloadBalance(workspaceId, ctx = {}) {
        const loads = await this.collectWorkloadLoads(workspaceId);
        const heuristic = computeWorkloadBalance(loads, { source: 'heuristic' });
        if (!this.isAvailable() || heuristic.suggestions.length === 0)
            return heuristic;
        try {
            const loadLines = loads.map((l) => `${l.name} (id ${l.userId}): ${l.open} open`).join('\n');
            const response = await this.complete('workload.balance', ctx, {
                model: 'claude-haiku-4-5',
                max_tokens: 700,
                system: `You balance team workload for the Rundesk project management app.
Given each teammate's open-task count, propose up to 3 redistribution moves from overloaded to underloaded teammates.
Respond ONLY with a valid JSON array: [{ "fromUserId": "id", "toUserId": "id", "count": integer, "rationale": "one sentence" }].
Only move work FROM people above the team average TO people below it. Never move more tasks than the source has. Use the exact ids provided.`,
                messages: [{ role: 'user', content: `Open-task load per teammate:\n${loadLines}\n\nTeam average: ${heuristic.average}` }],
            });
            const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
            const match = text.match(/\[[\s\S]*\]/);
            const ai = mapAiWorkloadMoves(match ? safeJsonParse(match[0]) : undefined, loads);
            return ai.suggestions.length ? ai : heuristic;
        }
        catch {
            return heuristic;
        }
    }
    /**
     * Execute confirmed workload moves (Plan §7.12): reassign each task from
     * `fromUserId` to `toUserId` by reusing TasksService.addAssignee +
     * removeAssignee (each access-checked against the actor). `toUserId` must be a
     * non-guest member of `workspaceId`; tasks the actor can't modify are skipped.
     */
    async executeWorkloadBalance(workspaceId, moves, userId) {
        let reassigned = 0;
        let skipped = 0;
        const perMove = [];
        const memberCache = new Map();
        const isMember = async (uid) => {
            if (memberCache.has(uid))
                return memberCache.get(uid);
            const role = await this.memberRole(workspaceId, uid);
            const ok = Boolean(role) && role !== 'guest';
            memberCache.set(uid, ok);
            return ok;
        };
        for (const move of moves ?? []) {
            let mReassigned = 0;
            let mSkipped = 0;
            const taskIds = Array.isArray(move?.taskIds) ? move.taskIds.slice(0, 100) : [];
            const targetOk = move?.toUserId && move.toUserId !== move.fromUserId && (await isMember(move.toUserId));
            for (const taskId of taskIds) {
                if (!targetOk) {
                    mSkipped++;
                    continue;
                }
                try {
                    // Access checks live in TasksService: addAssignee/removeAssignee both
                    // assertTaskWriteAccess(taskId, actor), so a caller can only reassign
                    // tasks they may edit — and only within this workspace.
                    await this.tasks.addAssignee(taskId, move.toUserId, userId);
                    await this.tasks.removeAssignee(taskId, move.fromUserId, userId);
                    mReassigned++;
                }
                catch {
                    mSkipped++;
                }
            }
            reassigned += mReassigned;
            skipped += mSkipped;
            perMove.push({ fromUserId: move.fromUserId, toUserId: move.toUserId, reassigned: mReassigned, skipped: mSkipped });
        }
        return { reassigned, skipped, moves: perMove };
    }
    /** Workspace managers/admins (recipients of proactive workload alerts, Plan §7.12). */
    async workspaceManagers(workspaceId) {
        return this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.role, ['workspace_admin', 'manager', 'super_admin'])));
    }
    /** Workspaces that currently have any open (non-archived, non-closed) assigned tasks. */
    async workspacesWithOpenWork() {
        const rows = await this.db
            .selectDistinct({ workspaceId: db_1.spaces.workspaceId })
            .from(db_1.tasks)
            .innerJoin(db_1.taskAssignees, (0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, db_1.tasks.id))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.sql) `${db_1.tasks.statusCategory} <> 'closed'`));
        return rows.map((r) => r.workspaceId);
    }
    /** Overloaded-user ids already alerted in this workspace since `cutoff` (dedupe). */
    async recentlyWorkloadAlerted(workspaceId, cutoff) {
        const rows = await this.db
            .select({ entityId: (0, drizzle_orm_1.sql) `${db_1.notifications.target}->>'entityId'` })
            .from(db_1.notifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.notifications.type, 'workload_alert'), (0, drizzle_orm_1.gte)(db_1.notifications.createdAt, cutoff)));
        return new Set(rows.map((r) => r.entityId).filter((id) => Boolean(id)));
    }
    // ─── Contribution narratives (Plan §7.14) ─────────────────────────────────
    /**
     * Generate a one-sentence contribution narrative per member from precomputed
     * real metrics (Plan §7.14). One model call (haiku) covers everyone; on any
     * failure or when AI is unavailable each member falls back to its deterministic
     * narrative. Never throws.
     */
    async narrateContributions(items, ctx = {}) {
        const fallbackMap = {};
        for (const it of items)
            fallbackMap[it.key] = it.fallback;
        if (items.length === 0 || !this.isAvailable())
            return fallbackMap;
        try {
            const block = items.map((it, i) => `${i + 1}. ${it.name} — ${it.facts}`).join('\n');
            const response = await this.complete('contribution.narrative', ctx, {
                model: 'claude-haiku-4-5',
                max_tokens: 900,
                system: `You write one-sentence contribution summaries for team members based on their real metrics for a reporting period.
Respond ONLY with a valid JSON object mapping each member's number to a warm, specific one-sentence summary, e.g. { "1": "...", "2": "..." }. Do not invent metrics beyond those given.`,
                messages: [{ role: 'user', content: `Members and metrics:\n${block}` }],
            });
            const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
            const parsed = safeJsonParse((text.match(/\{[\s\S]*\}/) ?? [''])[0]);
            if (!parsed || typeof parsed !== 'object')
                return fallbackMap;
            const out = {};
            items.forEach((it, i) => {
                const v = parsed[String(i + 1)];
                out[it.key] = typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : it.fallback;
            });
            return out;
        }
        catch {
            return fallbackMap;
        }
    }
};
exports.AiService = AiService;
exports.AiService = AiService = AiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService, Object, tasks_service_1.TasksService,
        search_service_1.SearchService,
        embedding_service_1.EmbeddingService,
        r2_service_1.R2Service])
], AiService);
//# sourceMappingURL=ai.service.js.map