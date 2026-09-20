import { ConfigService } from '@nestjs/config';
import type { Db } from '@rundesk/db';
import { type StandupData } from '../people/standup';
import { type ModelTier } from './model-tiers';
import { type MinedSkill, type ProposalStep, type SkillProposal } from '../skills/skill-proposal';
import { R2Service } from '../../common/storage/r2.service';
import { TasksService } from '../tasks/tasks.service';
import { SearchService } from '../search/search.service';
import { EmbeddingService } from './embedding.service';
import { type KnowledgeSource, type RawSearchHit } from './knowledge';
import { type CommandContext, type CommandExecuteResult, type CommandPlan, type PlanAction } from './ai-command';
export type AiCtx = {
    userId?: string;
    workspaceId?: string;
};
/** `ai_usage.status`, as the activity log filters on it. */
export type AiRunStatus = 'succeeded' | 'failed';
export type WorkspaceContextData = {
    workspaceName: string;
    role: string;
    counts: {
        spaces: number;
        projects: number;
        lists: number;
        openTasks: number;
    };
    spaces: Array<{
        name: string;
        projects: string[];
    }>;
    openTasks: Array<{
        title: string;
        dueDate: Date | string | null;
        priority: string;
    }>;
    history: Array<{
        title: string;
        status: string;
        updatedAt: Date | string | null;
    }>;
    currentView?: string;
};
/**
 * Assemble the grounded workspace context string (Plan §7.6/§7.15). Pure and
 * token-bounded: caps structure to 15 spaces × 8 projects, 15 open tasks, and
 * 40 history rows. Extracted from the DB read so it can be unit-tested directly.
 */
export declare function formatWorkspaceContext(data: WorkspaceContextData): string;
export type TaskSummaryInput = {
    title: string;
    description: string | null;
    status?: string | null;
    priority?: string | null;
    activity: Array<{
        action: string;
        actor: string | null;
    }>;
    subtasks: Array<{
        title: string;
        status: string;
    }>;
    blockers: Array<{
        title: string;
        status: string;
    }>;
    comments: Array<{
        author: string | null;
        body: string;
    }>;
};
/**
 * Assemble the enriched task-summary prompt input (Plan §7.5). Pure and bounded:
 * caps subtasks (12), blockers (10), comments (last 6, trimmed), activity (8).
 * Extracted from the DB reads so it can be unit-tested directly.
 */
export declare function formatTaskSummaryInput(input: TaskSummaryInput): string;
export type AutomationBehavior = {
    totalOpenTasks: number;
    overdueCount: number;
    statusTransitions: Array<{
        from: string;
        to: string;
        count: number;
    }>;
    topAssignees: Array<{
        name: string;
        count: number;
    }>;
    commentActivityCount: number;
};
export type AutomationSuggestion = {
    name: string;
    trigger: {
        type: string;
        filters?: Record<string, string>;
    };
    actions: Array<{
        type: string;
        params: Record<string, string>;
    }>;
    rationale: string;
};
/** Compact, human-readable behavior summary fed to the model. Pure + testable. */
export declare function formatAutomationBehavior(b: AutomationBehavior): string;
/** Format an assignee open-task-count list into a one-line workload signal (Plan §7.4). */
export declare function formatTeamWorkload(rows: Array<{
    name: string;
    open: number;
}>): string;
/**
 * Validate/normalize model-produced suggestions against the trigger/action
 * whitelists, coercing params to a string map and dropping anything invalid.
 * Pure so the parsing contract is unit-tested without a model. Extracted from
 * the raw text so both the AI and fallback paths share one shape.
 */
export declare function sanitizeAutomationSuggestions(raw: unknown): AutomationSuggestion[];
/**
 * Deterministic fallback used when AI is unavailable or returns nothing usable.
 * Derives 2-4 sensible rules from the behavior stats and always returns >= 2.
 * Pure + testable.
 */
export declare function deterministicAutomationSuggestions(b: AutomationBehavior): AutomationSuggestion[];
export type SentimentLabel = 'positive' | 'neutral' | 'negative';
export type SentimentResult = {
    /** 0–100: share of comments reading positive (neutral counts half). */
    score: number;
    label: SentimentLabel;
    positive: number;
    negative: number;
    samples: number;
    source: 'ai' | 'deterministic';
};
/**
 * Deterministic keyword sentiment over a set of comment bodies (Plan §7.13).
 * Pure + testable — the always-on fallback when the model is unavailable.
 * `score` is the share of comments that read positive (neutral counts half),
 * so an empty set is a neutral 50.
 */
export declare function analyzeSentimentDeterministic(texts: string[]): SentimentResult;
export type BriefingData = {
    displayName: string;
    /** Task titles due today, blocking others, overdue, and at-risk soon. */
    dueToday: string[];
    overdue: string[];
    blocking: string[];
    atRisk: string[];
};
/** True when the briefing has at least one noteworthy item across all buckets. */
export declare function briefingHasContent(data: BriefingData): boolean;
/**
 * Deterministic daily-briefing text (Plan §7.11). Pure + testable — the always-on
 * fallback used when the model is unavailable (ANTHROPIC_API_KEY unset). Leads
 * with the most urgent buckets (overdue, then blocking others, then due-today,
 * then at-risk) and always returns a non-empty, human-readable body.
 */
export declare function formatBriefingFallback(data: BriefingData): string;
export type TaskPriorityValue = 'urgent' | 'high' | 'normal' | 'low';
export type TaskSuggestion = {
    title: string;
    priority?: TaskPriorityValue;
};
export type SimilarProject = {
    id: string;
    name: string;
    taskTitles: string[];
    score: number;
};
/** Tokenize a project name/description into a lowercased keyword set (stopwords + short words removed). Pure. */
export declare function projectKeywords(text: string): Set<string>;
/**
 * Similarity between a target project name and a candidate name by keyword
 * overlap (Jaccard) plus a substring-containment bonus. Range 0–1. Pure + testable.
 */
export declare function projectSimilarity(target: string, candidate: string): number;
/**
 * Rank candidate projects by similarity to the target name; keep those with any
 * signal, or fall back to the most recent few when nothing matches. Pure + testable.
 */
export declare function rankSimilarProjects(target: string, candidates: Array<{
    id: string;
    name: string;
    taskTitles: string[];
}>, limit?: number): SimilarProject[];
/**
 * Deterministic task suggestions (Plan §7.10 fallback): the most-frequent task
 * titles across the similar projects, most common first (a title is counted at
 * most once per project so one large project can't dominate). Pure + testable —
 * the always-on fallback when the model is unavailable.
 */
export declare function deterministicTaskSuggestions(similar: SimilarProject[], limit?: number): TaskSuggestion[];
/** Validate/normalize model task suggestions against the priority whitelist, de-duping by title. Pure. */
export declare function sanitizeTaskSuggestions(raw: unknown, limit?: number): TaskSuggestion[];
/** Human-readable "learned from" basis line for the suggestions response. Pure. */
export declare function summarizeSuggestionBasis(similar: SimilarProject[]): string;
export type WorkloadLoad = {
    userId: string;
    name: string;
    open: number;
    taskIds: string[];
};
export type WorkloadMove = {
    fromUserId: string;
    fromName: string;
    toUserId: string;
    toName: string;
    count: number;
    taskIds: string[];
    rationale: string;
    source: 'ai' | 'heuristic';
};
export type WorkloadBalanceResult = {
    source: 'ai' | 'heuristic';
    average: number;
    loads: Array<{
        userId: string;
        name: string;
        open: number;
    }>;
    suggestions: WorkloadMove[];
};
/**
 * Deterministic workload redistribution (Plan §7.12 fallback): greedily pair the
 * most-overloaded assignee with the least-loaded one and propose moving enough
 * tasks to close ~half the gap, drawing the specific task ids from the
 * overloaded assignee. Only rebalances a real imbalance (source above the team
 * average, gap ≥ 2). Pure + testable.
 */
export declare function computeWorkloadBalance(loads: WorkloadLoad[], opts?: {
    source?: 'ai' | 'heuristic';
    maxSuggestions?: number;
}): WorkloadBalanceResult;
/**
 * Identify assignees significantly overloaded relative to the team (Plan §7.12
 * proactive alert): open count ≥ `absoluteMin` AND ≥ team average × `factor`.
 * Pure + testable.
 */
export declare function findOverloadedAssignees(loads: Array<{
    userId: string;
    name: string;
    open: number;
}>, opts?: {
    factor?: number;
    absoluteMin?: number;
}): Array<{
    userId: string;
    name: string;
    open: number;
    average: number;
}>;
/**
 * Map model-proposed workload moves ({fromUserId,toUserId,count}) onto the REAL
 * per-assignee loads, resolving the actual task ids server-side (never trusting
 * model-invented ids) and clamping counts to what the source actually has.
 * Pure + testable.
 */
export declare function mapAiWorkloadMoves(raw: unknown, loads: WorkloadLoad[]): WorkloadBalanceResult;
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
export type SseStream = {
    write: (chunk: string) => void;
    end: () => void;
};
export declare function openSseStream(res: Response): SseStream;
export declare class AiService {
    private config;
    private db;
    private tasks;
    private search?;
    private embeddings?;
    private r2?;
    private client;
    constructor(config: ConfigService, db: Db, tasks: TasksService, search?: SearchService | undefined, embeddings?: EmbeddingService | undefined, r2?: R2Service | undefined);
    private get claude();
    private get hourlyLimit();
    /**
     * Enforce a per-user hourly AI call cap (Plan §7.15 "per-user rate limits").
     * Throws 429 when exceeded. No-op for calls without a user context.
     */
    private get orgHourlyLimit();
    assertWithinRateLimit(ctx: AiCtx, now?: Date, feature?: string): Promise<void>;
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
    assertAvailable(feature: string, ctx?: AiCtx): Promise<void>;
    /**
     * Create a message: rate-limit, enable prompt caching on the system block,
     * and record token usage (Plan §7.15). All non-streaming AI calls route here.
     */
    private complete;
    recordUsage(feature: string, model: string, ctx: AiCtx, inputTokens: number, outputTokens: number): Promise<void>;
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
    recordFailure(feature: string, model: string, ctx: AiCtx, errorCode: 'not_configured' | 'rate_limited' | 'provider_error', errorMessage: string): Promise<void>;
    /** Aggregate AI usage + estimated cost, per user and per model (Plan §7.15). */
    usageSummary(opts?: {
        workspaceId?: string;
        from?: Date;
        to?: Date;
        actor?: {
            id: string;
            role?: string;
        };
    }): Promise<{
        totals: {
            calls: number;
            inputTokens: number;
            outputTokens: number;
            costUsd: number;
        };
        byUser: {
            [k: string]: {
                costUsd: number;
                calls: number;
                inputTokens: number;
                outputTokens: number;
            };
        };
        byModel: {
            [k: string]: {
                costUsd: number;
                calls: number;
                inputTokens: number;
                outputTokens: number;
            };
        };
        byFeature: {
            [k: string]: {
                costUsd: number;
                calls: number;
                inputTokens: number;
                outputTokens: number;
            };
        };
    }>;
    /**
     * §V2-11, frames `19:00`/`19:05` — what the AI was WORTH, beside what it cost.
     *
     * Shares `usageSummary`'s access check by calling it: spend and per-person
     * usage are workspace-confidential, and a second endpoint answering the same
     * question through a second, subtly different guard is how a leak happens.
     */
    valueSummary(opts: {
        workspaceId: string;
        from?: Date;
        to?: Date;
        actor: {
            id: string;
            role?: string;
        };
    }): Promise<{
        byFeature: {
            [k: string]: {
                costUsd: number;
                calls: number;
                inputTokens: number;
                outputTokens: number;
            };
        };
        byCategory: import("./ai-categories").CategoryRollup[];
        uncategorisedFeatures: string[];
        runs: number;
        costUsd: number;
        benchmark: import("./ai-value").ValueBenchmark;
        minutesSaved: number;
        laborValueUsd: number;
        netValueUsd: number;
    }>;
    /**
     * §V2-11 — "Edit benchmark", frame `19:00`.
     *
     * Admin-only, because it changes a number the whole workspace is shown and
     * that somebody may put in front of a client. Validated here as well as by
     * the database's CHECK: the API should refuse with a sentence, not surface a
     * constraint violation.
     */
    updateValueBenchmark(workspaceId: string, actor: {
        id: string;
        role?: string;
    }, patch: {
        minutesSavedPerRun?: number;
        hourlyRateCents?: number;
    }): Promise<{
        minutesSavedPerRun: number;
        hourlyRateCents: number;
    }>;
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
    runLog(opts: {
        workspaceId: string;
        actor: {
            id: string;
            role?: string;
        };
        from?: Date;
        to?: Date;
        feature?: string;
        userId?: string;
        status?: AiRunStatus;
        limit?: number;
    }): Promise<{
        costUsd: number;
        id: string;
        feature: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        createdAt: Date;
        userId: string | null;
        status: string;
        errorCode: string | null;
        errorMessage: string | null;
    }[]>;
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
    modelPreference(userId: string, workspaceId: string): Promise<{
        preferredTier: ModelTier['id'];
        /** False when nothing is stored, so the surface can say "not set" honestly. */
        isSet: boolean;
        updatedAt: Date | null;
    }>;
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
    setModelPreference(userId: string, workspaceId: string, preferredTier: string): Promise<{
        preferredTier: ModelTier["id"];
        /** False when nothing is stored, so the surface can say "not set" honestly. */
        isSet: boolean;
        updatedAt: Date | null;
    }>;
    generateTask(prompt: string, context?: string, ctx?: AiCtx, customFields?: Array<{
        name: string;
        type: string;
        options?: string[];
    }>): Promise<{
        title: string;
        description: string;
        subtasks: string[];
        priority: 'urgent' | 'high' | 'normal' | 'low';
        estimatedHours?: number;
        customFieldValues?: Array<{
            fieldName: string;
            value: string | number | boolean;
        }>;
    }>;
    extractTasksFromNotes(notes: string, ctx?: AiCtx): Promise<Array<{
        title: string;
        description: string;
        assigneeName?: string;
        dueDate?: string;
        priority: string;
    }>>;
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
    notesFromTranscript(transcript: string, ctx?: AiCtx): Promise<string>;
    suggestPriority(title: string, description?: string, ctx?: AiCtx): Promise<{
        priority: 'urgent' | 'high' | 'normal' | 'low';
        reasoning: string;
    }>;
    summarize(content: string, type?: 'task' | 'project', ctx?: AiCtx): Promise<string>;
    improveWriting(text: string, mode?: 'improve' | 'shorten' | 'expand' | 'format', ctx?: AiCtx): Promise<string>;
    chatStream(messages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>, workspaceContext: string, res: Response, ctx?: AiCtx, 
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
    opened?: SseStream): Promise<void>;
    /**
     * Non-streaming chatbot reply (Plan §7.6) — used when @Rundesk is mentioned
     * in a channel so the answer can be posted as a normal message.
     */
    chatReply(messages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>, workspaceContext: string, ctx?: AiCtx, 
    /**
     * §15 — answering as a skill invoked by its slash command. First in the
     * prompt and replacing the generic description, for the same reason as
     * `chatStream`: a skill that asks for a particular voice must not be
     * overruled by a default two lines below it.
     */
    skillPrompt?: string): Promise<string>;
    /**
     * Build a real workspace context string for the chatbot (Plan §7.6/§7.15):
     * the user's role, workspace structure (space/project/list counts + names),
     * their open assigned tasks, and their recent task history (last 90 days) —
     * plus an optional current-view hint from the caller — so answers are grounded
     * instead of a workspace-ID stub. Token-bounded via `formatWorkspaceContext`.
     */
    buildWorkspaceContext(workspaceId: string, userId: string, opts?: {
        currentView?: string;
    }): Promise<string>;
    /**
     * Assemble an enriched summary input for a task (Plan §7.5): title, status,
     * priority and description plus recent activity, open subtasks, open blockers,
     * and recent comments — all read via TasksService. Bounded for token safety by
     * `formatTaskSummaryInput`.
     */
    buildTaskSummaryInput(taskId: string): Promise<string>;
    /**
     * Streaming task/project summary (Plan §7.5) — mirrors `chatStream`'s SSE
     * framing (`{delta}` / `[DONE]` / `{error}`) so the client renders tokens as
     * they arrive. Uses the same model as the non-streaming `summarize`.
     */
    summarizeStream(content: string, type: 'task' | 'project', res: Response, ctx?: AiCtx): Promise<void>;
    suggestDeadline(title: string, description?: string, teamWorkload?: string, ctx?: AiCtx): Promise<{
        suggestedDate: string;
        reasoning: string;
    }>;
    /**
     * Compact current-workload signal for a task's assignees (Plan §7.4): each
     * assignee's count of open (non-closed, non-archived) tasks across the
     * workspace. Returns undefined when the task has no assignees so the deadline
     * prompt omits the line entirely.
     */
    buildTeamWorkloadSignal(taskId: string): Promise<string | undefined>;
    /** Assert the caller is a member of the workspace (used by the suggestions endpoint). */
    assertWorkspaceMember(workspaceId: string, userId: string): Promise<void>;
    private static normalizeQuestion;
    getAnswerFeedback(workspaceId: string, userId: string, question: string): Promise<'up' | 'down' | null>;
    /**
     * Set, flip or clear. Pressing the thumb that is already lit clears it —
     * the same convention `chat-threads.controller.ts` uses, so the two feedback
     * controls in the product do not behave differently from each other.
     *
     * Returns the rating now in force, so the caller never has to guess what its
     * own click produced.
     */
    setAnswerFeedback(workspaceId: string, userId: string, question: string, rating: 'up' | 'down' | null): Promise<{
        feedback: 'up' | 'down' | null;
    }>;
    /** Bounded cap on candidate embedding rows fetched per workspace for ranking. */
    private get knowledgeCandidateCap();
    /**
     * Embed the question with the SAME embedder used at index-time (env-gated real
     * API or the deterministic local embedder). Falls back to the pure local
     * embedder if no EmbeddingService is injected (some unit-test constructions).
     */
    private embedQuestion;
    /**
     * Retrieve the access-scoped, semantically-ranked hits that ground a knowledge
     * answer. Embeds the question, ranks the workspace's embeddings by cosine,
     * over-fetches the top candidates, then filters by container visibility.
     */
    retrieveKnowledgeHits(workspaceId: string, userId: string, question: string, limit?: number): Promise<RawSearchHit[]>;
    /**
     * Hydrate the (already access-filtered) top hits with their live source text,
     * so the model gets grounded context — the embeddings table stores only
     * title/url, not the body. Only used on the AI-answer path. Best-effort:
     * missing text just leaves the title as the citation.
     */
    private enrichKnowledgeContent;
    /**
     * Drop hits the caller isn't allowed to see. Workspace managers see
     * everything (mirrors SpacesService); everyone else is restricted to public
     * spaces/projects plus the private ones they're an explicit member of. User,
     * channel, and chat-message hits are already access-scoped by SearchService
     * and pass through unchanged.
     */
    private filterAccessibleHits;
    /**
     * Answer a natural-language question about the workspace, grounded in the
     * caller's accessible content. Uses the model (Sonnet) with a cited context
     * when available; otherwise returns the ranked matches with a "matches found"
     * message. Always returns the access-scoped `sources`; never fabricates.
     */
    answerKnowledge(workspaceId: string, userId: string, question: string, ctx?: AiCtx): Promise<{
        answer: string;
        sources: KnowledgeSource[];
        source: 'ai' | 'vector' | 'fallback';
    }>;
    /**
     * Answer a product/how-to question grounded in the curated help/FAQ knowledge
     * base (`HELP_TOPICS`). Uses the model (Haiku) when available; otherwise —
     * the deterministic fallback — returns the closest FAQ topic by keyword match.
     * Always returns the relevant FAQ entries as `sources`.
     */
    answerHelp(question: string, ctx?: AiCtx): Promise<{
        answer: string;
        sources: KnowledgeSource[];
        source: 'ai' | 'faq';
    }>;
    /**
     * Suggest 2-4 automation rules from recent workspace behavior (status
     * transitions, overdue pressure, active assignees, comment volume). Uses the
     * model when configured; otherwise — or on any AI error, including rate limits
     * — returns a deterministic heuristic. Never throws: always best-effort.
     */
    suggestAutomations(workspaceId: string, ctx?: AiCtx): Promise<{
        source: 'ai' | 'heuristic';
        suggestions: AutomationSuggestion[];
    }>;
    /** Read recent workspace behavior stats used to ground automation suggestions. */
    private collectAutomationBehavior;
    isAvailable(): boolean;
    /** Membership role for (workspace, user), or null when not a member. */
    private memberRole;
    private resolveListWorkspaceId;
    private resolveTaskWorkspaceId;
    /**
     * Assert the user may read a task's workspace (Plan §7.5 hardening). Reused by
     * the `/ai/summarize` taskId path so any authed user can no longer summarize an
     * arbitrary task by id.
     */
    assertTaskWorkspaceAccess(taskId: string, userId: string): Promise<void>;
    /**
     * Load the bounded, DB-resolved context the command planner needs: destination
     * lists (with paths), workspace members (for assigneeEmail→userId), and the
     * open tasks (with assignee emails) that search / bulk filters run against.
     */
    loadCommandContext(workspaceId: string, actorId: string, actorRole?: string | null): Promise<CommandContext>;
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
    proposeSkill(workspaceId: string, userId: string, request: string, ctx?: AiCtx, 
    /**
     * Called as each lookup finishes, so the caller can show the work.
     *
     * A step is emitted only once its lookup has actually returned. The
     * alternative — a client animating a hardcoded list of labels — would look
     * identical on a good day and lie on a bad one, and it is precisely on the
     * bad day that someone needs to know what was and was not read.
     */
    onStep?: (step: ProposalStep) => void): Promise<{
        proposal: SkillProposal;
        message: string;
    }>;
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
    mineSkills(workspaceId: string, userId: string, ctx?: AiCtx, onStep?: (step: ProposalStep) => void): Promise<{
        skills: MinedSkill[];
        message: string;
    }>;
    /**
     * §15 — name a chat from what it is about, frames `296_1817` → `297_1820`.
     *
     * Returns '' when no model is configured rather than inventing something:
     * the caller has a deterministic fallback built from the first question,
     * which is a better name than anything guessed here.
     */
    titleForChat(messages: Array<{
        role: string;
        content: string;
    }>, ctx?: AiCtx): Promise<string>;
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
    askAboutMeetings(question: string, meetingsContext: Array<{
        title: string;
        startsAt: Date | null;
        notes: string | null;
        attendees: string[];
    }>, ctx?: AiCtx): Promise<{
        answer: string;
        grounded: boolean;
    }>;
    command(workspaceId: string, message: string, ctx?: AiCtx): Promise<CommandPlan>;
    /**
     * Execute confirmed actions via TasksService (Plan §7.6). Each mutation is
     * access-checked (TasksService enforces task write permission; create_task
     * verifies non-guest workspace membership) — actions the caller can't perform
     * are skipped and reported rather than failing the batch. TasksService already
     * audits each mutation via its activity log.
     */
    executeActions(actions: PlanAction[], userId: string): Promise<CommandExecuteResult>;
    private executeOne;
    generateInsights(context: string, ctx?: AiCtx): Promise<{
        summary: string;
        health: {
            score: number;
            label: string;
            reasoning: string;
        };
        suggestions: Array<{
            title: string;
            detail: string;
            cta?: string;
            target?: string;
        }>;
    }>;
    suggestDashboardLayout(availableWidgets: Array<{
        type: string;
        label: string;
    }>, context: string, ctx?: AiCtx): Promise<{
        widgets: string[];
        reasoning: string;
    }>;
    /**
     * Gauge team sentiment from a project's recent task comments (Plan §7.13).
     * Uses the model (haiku) when configured; otherwise — or on any AI error /
     * malformed output — falls back to the deterministic keyword classifier.
     * Never throws so the daily health cron can always fold in a sentiment score.
     */
    analyzeCommentSentiment(texts: string[], ctx?: AiCtx): Promise<SentimentResult>;
    /**
     * Generate a short daily briefing (Plan §7.11). Uses the model (haiku) when
     * configured; otherwise — or on any AI error — returns the deterministic
     * template. Never throws: always best-effort so the cron can always deliver.
     */
    generateBriefing(data: BriefingData, ctx?: AiCtx): Promise<string>;
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
    generateStandup(data: StandupData, ctx?: AiCtx): Promise<string>;
    /** Ensure the caller is a manager/admin of the workspace (mutating AI actions). */
    assertWorkspaceManager(workspaceId: string, userId: string): Promise<void>;
    /**
     * Suggest a task list for a project by learning from SIMILAR existing projects
     * in the workspace (Plan §7.10): rank candidates by name/keyword similarity,
     * summarize their task titles, and return the most-frequent titles as a
     * deterministic fallback; refine with the model (haiku) when configured. Never
     * throws — always best-effort so the UI can always render something.
     */
    suggestTasks(input: {
        workspaceId: string;
        projectId?: string;
        projectName?: string;
        description?: string;
    }, ctx?: AiCtx): Promise<{
        source: 'ai' | 'heuristic';
        suggestions: TaskSuggestion[];
        basis: string;
    }>;
    private resolveProjectName;
    /** Workspace projects (excluding the target) with their bounded top-level task titles. */
    private collectCandidateProjects;
    /**
     * Per-member open-task load (non-archived, non-closed) across the workspace,
     * with each member's task ids ordered least-urgent-first so the tasks handed
     * off first are the safest to move. Reuses the workload report's join shape.
     */
    collectWorkloadLoads(workspaceId: string): Promise<WorkloadLoad[]>;
    /**
     * Redistribution suggestions from real per-assignee open-task load (Plan §7.12).
     * Deterministic heuristic always available; refined by the model (haiku) when
     * configured, with task ids resolved server-side from the real loads.
     */
    workloadBalance(workspaceId: string, ctx?: AiCtx): Promise<WorkloadBalanceResult>;
    /**
     * Execute confirmed workload moves (Plan §7.12): reassign each task from
     * `fromUserId` to `toUserId` by reusing TasksService.addAssignee +
     * removeAssignee (each access-checked against the actor). `toUserId` must be a
     * non-guest member of `workspaceId`; tasks the actor can't modify are skipped.
     */
    executeWorkloadBalance(workspaceId: string, moves: Array<{
        fromUserId: string;
        toUserId: string;
        taskIds: string[];
    }>, userId: string): Promise<{
        reassigned: number;
        skipped: number;
        moves: Array<{
            fromUserId: string;
            toUserId: string;
            reassigned: number;
            skipped: number;
        }>;
    }>;
    /** Workspace managers/admins (recipients of proactive workload alerts, Plan §7.12). */
    workspaceManagers(workspaceId: string): Promise<Array<{
        userId: string;
    }>>;
    /** Workspaces that currently have any open (non-archived, non-closed) assigned tasks. */
    workspacesWithOpenWork(): Promise<string[]>;
    /** Overloaded-user ids already alerted in this workspace since `cutoff` (dedupe). */
    recentlyWorkloadAlerted(workspaceId: string, cutoff: Date): Promise<Set<string>>;
    /**
     * Generate a one-sentence contribution narrative per member from precomputed
     * real metrics (Plan §7.14). One model call (haiku) covers everyone; on any
     * failure or when AI is unavailable each member falls back to its deterministic
     * narrative. Never throws.
     */
    narrateContributions(items: Array<{
        key: string;
        name: string;
        facts: string;
        fallback: string;
    }>, ctx?: AiCtx): Promise<Record<string, string>>;
}
