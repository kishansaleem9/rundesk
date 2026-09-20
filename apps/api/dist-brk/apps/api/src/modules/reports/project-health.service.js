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
var ProjectHealthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectHealthService = exports.SENTIMENT_WEIGHT = void 0;
exports.bandForScore = bandForScore;
exports.foldSentimentIntoHealth = foldSentimentIntoHealth;
exports.utcDayString = utcDayString;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const reports_service_1 = require("./reports.service");
const ai_service_1 = require("../ai/ai.service");
/**
 * Fixed, documented weight the comment-sentiment component contributes to a
 * project's blended health score (Plan §7.13). The four deterministic signals
 * from ReportsService.getProjectHealth (on-time, overdue, blockers, activity)
 * keep their relative weights, scaled to the remaining 85%.
 */
exports.SENTIMENT_WEIGHT = 0.15;
/** Band thresholds shared with getProjectHealth: green ≥ 75, yellow ≥ 50, else red. */
function bandForScore(score) {
    return score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';
}
/**
 * Fold a 0–100 comment-sentiment score into a base project-health result with a
 * fixed weight (SENTIMENT_WEIGHT). Empty projects (band 'empty', no tasks) stay
 * at score 0 / band 'empty' — sentiment never resurrects a project with no work.
 * Pure + testable: the scoring math the daily cron persists.
 */
function foldSentimentIntoHealth(base, sentimentScore0to100) {
    const sentiment = Math.max(0, Math.min(100, Math.round(sentimentScore0to100)));
    const components = { ...base.components, sentiment };
    if (base.band === 'empty') {
        return { score: 0, band: 'empty', components };
    }
    const blended = Math.round(base.score * (1 - exports.SENTIMENT_WEIGHT) + sentiment * exports.SENTIMENT_WEIGHT);
    const score = Math.max(0, Math.min(100, blended));
    return { score, band: bandForScore(score), components };
}
/** UTC calendar-day string (YYYY-MM-DD) for a Date — the `scored_on` key. */
function utcDayString(now) {
    return now.toISOString().slice(0, 10);
}
/**
 * §7.13 — daily cron that persists one project-health row per active project per
 * day. Reuses ReportsService.getProjectHealth for the deterministic signals,
 * folds in a comment-sentiment component (AiService — deterministic keyword
 * fallback when no model is configured), and upserts keyed by
 * (project_id, scored_on) so re-runs the same day are idempotent. Also serves
 * the persisted 30-day trend read.
 */
let ProjectHealthService = ProjectHealthService_1 = class ProjectHealthService {
    constructor(db, reports, ai) {
        this.db = db;
        this.reports = reports;
        this.ai = ai;
        this.logger = new common_1.Logger(ProjectHealthService_1.name);
    }
    async runDaily() {
        return this.scoreAll(new Date());
    }
    /**
     * Score + persist every workspace's active projects for the `now` day.
     * Best-effort per workspace so one failure never blocks the rest. Returns
     * counts so tests/ops can assert coverage without inspecting the table.
     */
    async scoreAll(now = new Date()) {
        const wsRows = await this.db.select({ id: db_1.workspaces.id }).from(db_1.workspaces);
        let projectsScored = 0;
        for (const ws of wsRows) {
            try {
                projectsScored += await this.scoreWorkspace(ws.id, now);
            }
            catch (err) {
                this.logger.error(`Project-health scoring failed for workspace ${ws.id}: ${err.message}`);
            }
        }
        if (projectsScored > 0)
            this.logger.log(`Scored ${projectsScored} project(s) across ${wsRows.length} workspace(s)`);
        return { workspaces: wsRows.length, projectsScored };
    }
    /**
     * Score + upsert all active projects in one workspace. Returns the number of
     * projects written.
     */
    async scoreWorkspace(workspaceId, now = new Date()) {
        const health = await this.reports.getProjectHealth(workspaceId);
        if (health.length === 0)
            return 0;
        const commentsByProject = await this.recentCommentsByProject(workspaceId);
        const scoredOn = utcDayString(now);
        let count = 0;
        for (const p of health) {
            const comments = commentsByProject.get(p.projectId) ?? [];
            const sentiment = await this.ai.analyzeCommentSentiment(comments, { workspaceId });
            const blended = foldSentimentIntoHealth({ score: p.score, band: p.band, components: p.components }, sentiment.score);
            await this.upsertProjectScore({
                projectId: p.projectId,
                workspaceId,
                score: blended.score,
                band: blended.band,
                components: blended.components,
                sentiment,
                scoredOn,
            });
            count += 1;
        }
        return count;
    }
    /** Idempotent upsert of one project's daily score (ON CONFLICT project_id, scored_on). */
    async upsertProjectScore(row) {
        const values = {
            projectId: row.projectId,
            workspaceId: row.workspaceId,
            score: row.score,
            band: row.band,
            components: row.components,
            sentiment: row.sentiment,
            scoredOn: row.scoredOn,
        };
        await this.db
            .insert(db_1.projectHealthScores)
            .values(values)
            .onConflictDoUpdate({
            target: [db_1.projectHealthScores.projectId, db_1.projectHealthScores.scoredOn],
            set: {
                score: values.score,
                band: values.band,
                components: values.components,
                sentiment: values.sentiment,
                workspaceId: values.workspaceId,
            },
        });
    }
    /**
     * §7.13 trend read — persisted daily scores for one project over the last
     * `days` (default 30), oldest → newest, for the sparkline.
     */
    async getTrend(workspaceId, projectId, days = 30) {
        const horizon = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
        const since = new Date(Date.now() - horizon * 86_400_000);
        const sinceDay = utcDayString(since);
        const rows = await this.db
            .select({
            scoredOn: db_1.projectHealthScores.scoredOn,
            score: db_1.projectHealthScores.score,
            band: db_1.projectHealthScores.band,
            components: db_1.projectHealthScores.components,
            sentiment: db_1.projectHealthScores.sentiment,
        })
            .from(db_1.projectHealthScores)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projectHealthScores.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.projectHealthScores.projectId, projectId), (0, drizzle_orm_1.gte)(db_1.projectHealthScores.scoredOn, sinceDay)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.projectHealthScores.scoredOn));
        const latest = rows.length ? rows[rows.length - 1] : null;
        return {
            projectId,
            days: horizon,
            current: latest ? { score: latest.score, band: latest.band, sentiment: latest.sentiment } : null,
            points: rows.map((r) => ({ date: r.scoredOn, score: r.score, band: r.band })),
        };
    }
    /**
     * Recent (last 14 days) task-comment bodies grouped by project id, bounded to
     * 40 comments per project so the sentiment prompt stays token-safe.
     */
    async recentCommentsByProject(workspaceId) {
        const since = new Date(Date.now() - 14 * 86_400_000);
        const rows = await this.db
            .select({ projectId: db_1.lists.projectId, body: db_1.taskComments.body })
            .from(db_1.taskComments)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskComments.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.taskComments.createdAt, since)))
            .orderBy((0, drizzle_orm_1.sql) `${db_1.taskComments.createdAt} desc`);
        const byProject = new Map();
        for (const r of rows) {
            const list = byProject.get(r.projectId) ?? [];
            if (list.length < 40 && r.body && r.body.trim())
                list.push(r.body);
            byProject.set(r.projectId, list);
        }
        return byProject;
    }
};
exports.ProjectHealthService = ProjectHealthService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_2AM, { name: 'project-health-daily' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ProjectHealthService.prototype, "runDaily", null);
exports.ProjectHealthService = ProjectHealthService = ProjectHealthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, reports_service_1.ReportsService,
        ai_service_1.AiService])
], ProjectHealthService);
//# sourceMappingURL=project-health.service.js.map