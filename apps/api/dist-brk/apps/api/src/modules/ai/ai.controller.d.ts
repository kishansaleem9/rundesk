import { AiService } from './ai.service';
import { SkillsService } from '../skills/skills.service';
import { BriefingService } from './briefing.service';
import type { PlanAction } from './ai-command';
export declare class AiController {
    private readonly ai;
    private readonly briefings;
    private readonly skills;
    constructor(ai: AiService, briefings: BriefingService, skills: SkillsService);
    /**
     * §V2-S18, frame `[17:16]` — what the composer's picker is allowed to offer.
     *
     * TWO LISTS, NOT ONE LIST WITH A FLAG. `models` is what this server can
     * actually route to; `unavailable` is what the frame names and this product
     * has no client for. They are separate shapes so no rewrite of the picker can
     * accidentally hand an unroutable id to `modelForTier` — the unroutable shape
     * has no field to put a model in.
     *
     * The unavailable entries carry a translation KEY, not a sentence: this is
     * read by a person in four locales.
     */
    models(): {
        models: readonly import("./model-tiers").ModelTier[];
        unavailable: readonly import("./model-tiers").UnroutableProvider[];
    };
    /**
     * §V2-S18 `[17:28]`–`[17:32]` — "apna [preferred] AI bhi set down karna hai."
     *
     * The preference was `localStorage` only (`rundesk.aiTier`), which is a
     * per-browser habit rather than a setting: it did not follow anybody to a
     * second machine. It is a row now, per person per workspace.
     */
    modelPreference(user: any, workspaceId: string): Promise<{
        preferredTier: import("./model-tiers").ModelTier["id"];
        isSet: boolean;
        updatedAt: Date | null;
    }>;
    setModelPreference(user: any, workspaceId: string, body: {
        preferredTier?: string;
    }): Promise<{
        preferredTier: import("./model-tiers").ModelTier["id"];
        isSet: boolean;
        updatedAt: Date | null;
    }>;
    status(): {
        available: boolean;
    };
    /**
     * §V2-11, frames `19:00`/`19:05` — what the AI was worth, beside what it cost.
     */
    value(user: any, workspaceId: string, from?: string, to?: string): Promise<{
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
    /** §V2-11 — "Edit benchmark", frame `19:00`. Admin-only. */
    updateBenchmark(user: any, workspaceId: string, body: {
        minutesSavedPerRun?: number;
        hourlyRateCents?: number;
    }): Promise<{
        minutesSavedPerRun: number;
        hourlyRateCents: number;
    }>;
    /**
     * §V2-11, frame `19:05` — the Activity log, one row per AI run.
     *
     * The frame's filter row is `Date run ▾ · Status ▾ · My agents · Agent ▾`.
     *
     * `userId` HAS BEEN ACCEPTED HERE SINCE THIS ENDPOINT WAS WRITTEN and the web
     * client never sent it, so the "mine only" toggle re-rendered and asked the
     * server for exactly the same rows — a UI-only build, and a live defect
     * rather than a missing feature. The client sends it now.
     *
     * `status` is new, and could not have existed before migration 0150: nothing
     * wrote a failed run, so the filter would have had one reachable value.
     *
     * The frame's "Agent" filter still has no counterpart, on purpose. Rundesk
     * has no agents, and a filter that can only ever return everything is a
     * control that lies about what it does.
     */
    activity(user: any, workspaceId: string, from?: string, to?: string, feature?: string, userId?: string, status?: string, limit?: string): Promise<{
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
    usage(user: any, workspaceId?: string, from?: string, to?: string): Promise<{
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
    briefing(user: any): Promise<{
        body: string;
        data: import("./ai.service").BriefingData;
    }>;
    generateTask(user: any, body: {
        prompt: string;
        context?: string;
        workspaceId?: string;
        customFields?: Array<{
            name: string;
            type: string;
            options?: string[];
        }>;
    }): Promise<{
        title: string;
        description: string;
        subtasks: string[];
        priority: "urgent" | "high" | "normal" | "low";
        estimatedHours?: number;
        customFieldValues?: Array<{
            fieldName: string;
            value: string | number | boolean;
        }>;
    }>;
    suggestPriority(user: any, body: {
        title: string;
        description?: string;
        workspaceId?: string;
    }): Promise<{
        priority: "urgent" | "high" | "normal" | "low";
        reasoning: string;
    }>;
    suggestDeadline(user: any, body: {
        title: string;
        description?: string;
        teamWorkload?: string;
        taskId?: string;
        workspaceId?: string;
    }): Promise<{
        suggestedDate: string;
        reasoning: string;
    }>;
    automationSuggestions(user: any, body: {
        workspaceId?: string;
    }): Promise<{
        source: "ai" | "heuristic";
        suggestions: import("./ai.service").AutomationSuggestion[];
    }>;
    summarize(user: any, body: {
        content?: string;
        taskId?: string;
        type?: 'task' | 'project';
        workspaceId?: string;
    }): Promise<{
        summary: string;
    }>;
    summarizeStream(user: any, body: {
        content?: string;
        taskId?: string;
        type?: 'task' | 'project';
        workspaceId?: string;
    }, res: any): Promise<void>;
    improveWriting(user: any, body: {
        text: string;
        mode?: 'improve' | 'shorten' | 'expand' | 'format';
        workspaceId?: string;
    }): Promise<{
        improved: string;
    }>;
    extractFromNotes(user: any, body: {
        notes: string;
        workspaceId?: string;
    }): Promise<{
        title: string;
        description: string;
        assigneeName?: string;
        dueDate?: string;
        priority: string;
    }[]>;
    insights(user: any, body: {
        context: string;
        workspaceId?: string;
    }): Promise<{
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
    suggestLayout(user: any, body: {
        availableWidgets: Array<{
            type: string;
            label: string;
        }>;
        context?: string;
        workspaceId?: string;
    }): Promise<{
        widgets: string[];
        reasoning: string;
    }>;
    chat(user: any, body: {
        messages: Array<{
            role: 'user' | 'assistant';
            content: string;
        }>;
        workspaceContext?: string;
        workspaceId?: string;
        currentView?: string;
        /** §15 — answer as this skill. Ignored without a workspaceId. */
        skillId?: string;
        /** §15 — 'fast' | 'deep'; anything else falls back to the default. */
        tier?: string;
    }, res: any): Promise<void>;
    suggestTasks(user: any, body: {
        workspaceId?: string;
        projectId?: string;
        projectName?: string;
        description?: string;
    }): Promise<{
        source: "ai" | "heuristic";
        suggestions: import("./ai.service").TaskSuggestion[];
        basis: string;
    }>;
    workloadBalance(user: any, body: {
        workspaceId?: string;
    }): Promise<import("./ai.service").WorkloadBalanceResult>;
    workloadBalanceExecute(user: any, body: {
        workspaceId?: string;
        moves?: Array<{
            fromUserId: string;
            toUserId: string;
            taskIds: string[];
        }>;
    }): Promise<{
        reassigned: number;
        skipped: number;
        moves: Array<{
            fromUserId: string;
            toUserId: string;
            reassigned: number;
            skipped: number;
        }>;
    }>;
    knowledge(user: any, body: {
        workspaceId?: string;
        question?: string;
    }): Promise<{
        feedback: "up" | "down" | null;
        answer: string;
        sources: import("./knowledge").KnowledgeSource[];
        source: "ai" | "vector" | "fallback";
    }>;
    knowledgeFeedback(user: any, body: {
        workspaceId?: string;
        question?: string;
        feedback?: 'up' | 'down' | null;
    }): Promise<{
        feedback: "up" | "down" | null;
    }>;
    helpTopics(): {
        id: string;
        question: string;
        answer: string;
    }[];
    help(user: any, body: {
        question?: string;
    }): Promise<{
        answer: string;
        sources: import("./knowledge").KnowledgeSource[];
        source: "ai" | "faq";
    }>;
    proposeSkill(user: any, body: {
        workspaceId?: string;
        request?: string;
    }, res: any): Promise<void>;
    mineSkills(user: any, body: {
        workspaceId?: string;
    }, res: any): Promise<void>;
    command(user: any, body: {
        workspaceId?: string;
        message?: string;
    }): Promise<import("./ai-command").CommandPlan>;
    commandExecute(user: any, body: {
        workspaceId?: string;
        actions?: PlanAction[];
    }): Promise<import("./ai-command").CommandExecuteResult>;
}
