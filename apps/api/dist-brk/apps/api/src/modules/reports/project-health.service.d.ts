import type { Db } from '@rundesk/db';
import { ReportsService } from './reports.service';
import { AiService, type SentimentResult } from '../ai/ai.service';
/**
 * Fixed, documented weight the comment-sentiment component contributes to a
 * project's blended health score (Plan §7.13). The four deterministic signals
 * from ReportsService.getProjectHealth (on-time, overdue, blockers, activity)
 * keep their relative weights, scaled to the remaining 85%.
 */
export declare const SENTIMENT_WEIGHT = 0.15;
export type HealthBand = 'green' | 'yellow' | 'red' | 'empty';
/** Band thresholds shared with getProjectHealth: green ≥ 75, yellow ≥ 50, else red. */
export declare function bandForScore(score: number): 'green' | 'yellow' | 'red';
export type HealthComponents = {
    onTime: number;
    overdue: number;
    blockers: number;
    activity: number;
};
export type BlendedHealth = {
    score: number;
    band: HealthBand;
    components: HealthComponents & {
        sentiment: number;
    };
};
/**
 * Fold a 0–100 comment-sentiment score into a base project-health result with a
 * fixed weight (SENTIMENT_WEIGHT). Empty projects (band 'empty', no tasks) stay
 * at score 0 / band 'empty' — sentiment never resurrects a project with no work.
 * Pure + testable: the scoring math the daily cron persists.
 */
export declare function foldSentimentIntoHealth(base: {
    score: number;
    band: string;
    components: HealthComponents;
}, sentimentScore0to100: number): BlendedHealth;
/** UTC calendar-day string (YYYY-MM-DD) for a Date — the `scored_on` key. */
export declare function utcDayString(now: Date): string;
/**
 * §7.13 — daily cron that persists one project-health row per active project per
 * day. Reuses ReportsService.getProjectHealth for the deterministic signals,
 * folds in a comment-sentiment component (AiService — deterministic keyword
 * fallback when no model is configured), and upserts keyed by
 * (project_id, scored_on) so re-runs the same day are idempotent. Also serves
 * the persisted 30-day trend read.
 */
export declare class ProjectHealthService {
    private db;
    private reports;
    private ai;
    private readonly logger;
    constructor(db: Db, reports: ReportsService, ai: AiService);
    runDaily(): Promise<{
        workspaces: number;
        projectsScored: number;
    }>;
    /**
     * Score + persist every workspace's active projects for the `now` day.
     * Best-effort per workspace so one failure never blocks the rest. Returns
     * counts so tests/ops can assert coverage without inspecting the table.
     */
    scoreAll(now?: Date): Promise<{
        workspaces: number;
        projectsScored: number;
    }>;
    /**
     * Score + upsert all active projects in one workspace. Returns the number of
     * projects written.
     */
    scoreWorkspace(workspaceId: string, now?: Date): Promise<number>;
    /** Idempotent upsert of one project's daily score (ON CONFLICT project_id, scored_on). */
    upsertProjectScore(row: {
        projectId: string;
        workspaceId: string;
        score: number;
        band: string;
        components: HealthComponents & {
            sentiment: number;
        };
        sentiment: SentimentResult;
        scoredOn: string;
    }): Promise<void>;
    /**
     * §7.13 trend read — persisted daily scores for one project over the last
     * `days` (default 30), oldest → newest, for the sparkline.
     */
    getTrend(workspaceId: string, projectId: string, days?: number): Promise<{
        projectId: string;
        days: number;
        current: {
            score: number;
            band: string;
            sentiment: {
                score: number;
                label: "positive" | "neutral" | "negative";
                positive: number;
                negative: number;
                samples: number;
                source: "ai" | "deterministic";
            };
        } | null;
        points: {
            date: string;
            score: number;
            band: string;
        }[];
    }>;
    /**
     * Recent (last 14 days) task-comment bodies grouped by project id, bounded to
     * 40 comments per project so the sentiment prompt stays token-safe.
     */
    private recentCommentsByProject;
}
