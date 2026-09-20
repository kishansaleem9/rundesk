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
var GitCommitLinksService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitCommitLinksService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const git_commit_links_util_1 = require("./git-commit-links.util");
/**
 * §12.8 — scan inbound GitHub/GitLab **push** events for commit messages that
 * reference a Rundesk task, and auto-create a `task_external_links` row
 * (kind:'commit') linking each such commit to its task.
 *
 * Env-gated on the *relevant provider connection*: a commit is only linked when
 * the referenced task's workspace has that provider (github/gitlab) connected.
 * Unconnected workspaces are skipped silently — the feature degrades to a no-op
 * rather than erroring. Idempotent: a commit already linked to a task (same
 * `external_id`) is never linked twice.
 */
let GitCommitLinksService = GitCommitLinksService_1 = class GitCommitLinksService {
    constructor(db) {
        this.db = db;
        this.logger = new common_1.Logger(GitCommitLinksService_1.name);
    }
    async ingestPush(provider, payload) {
        const summary = {
            ok: true,
            provider,
            commitsScanned: 0,
            referencesFound: 0,
            linked: 0,
            skippedExisting: 0,
            skippedNoConnection: 0,
            skippedUnknownTask: 0,
        };
        const commits = (0, git_commit_links_util_1.normalizePushCommits)(provider, payload);
        summary.commitsScanned = commits.length;
        // Cache per-task workspace resolution + per-workspace connection status so a
        // push touching many commits/tasks does at most one lookup of each.
        const workspaceByTask = new Map();
        const connectedByWorkspace = new Map();
        for (const commit of commits) {
            const taskIds = (0, git_commit_links_util_1.parseTaskRefsFromMessage)(commit.message);
            for (const taskId of taskIds) {
                summary.referencesFound += 1;
                let workspaceId = workspaceByTask.get(taskId);
                if (workspaceId === undefined) {
                    workspaceId = await this.resolveWorkspaceForTask(taskId);
                    workspaceByTask.set(taskId, workspaceId);
                }
                if (!workspaceId) {
                    summary.skippedUnknownTask += 1;
                    continue;
                }
                let connected = connectedByWorkspace.get(workspaceId);
                if (connected === undefined) {
                    connected = await this.isProviderConnected(workspaceId, provider);
                    connectedByWorkspace.set(workspaceId, connected);
                }
                if (!connected) {
                    summary.skippedNoConnection += 1;
                    continue;
                }
                const created = await this.linkCommit(provider, workspaceId, taskId, commit);
                if (created)
                    summary.linked += 1;
                else
                    summary.skippedExisting += 1;
            }
        }
        if (summary.linked > 0) {
            this.logger.log(`Linked ${summary.linked} ${provider} commit(s) to tasks (scanned ${summary.commitsScanned})`);
        }
        return summary;
    }
    /** Resolve a task's owning workspace via list → project → space, or null. */
    async resolveWorkspaceForTask(taskId) {
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
    /** True when the workspace has the given VCS provider connected. */
    async isProviderConnected(workspaceId, provider) {
        const [conn] = await this.db
            .select({ status: db_1.workspaceIntegrationConnections.status })
            .from(db_1.workspaceIntegrationConnections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.provider, provider)))
            .limit(1);
        return Boolean(conn && conn.status === 'connected');
    }
    /**
     * Insert a kind:'commit' link if one doesn't already exist for this task+commit.
     * Returns true when a new row was created, false when it already existed
     * (idempotent — a repo pushing the same commit twice never double-links).
     */
    async linkCommit(provider, workspaceId, taskId, commit) {
        const fields = (0, git_commit_links_util_1.buildCommitLinkFields)(provider, commit.repoSlug, commit.sha);
        const [existing] = await this.db
            .select({ id: db_1.taskExternalLinks.id })
            .from(db_1.taskExternalLinks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskExternalLinks.taskId, taskId), (0, drizzle_orm_1.eq)(db_1.taskExternalLinks.kind, 'commit'), (0, drizzle_orm_1.eq)(db_1.taskExternalLinks.externalId, fields.externalId)))
            .limit(1);
        if (existing)
            return false;
        // A commit URL is preferred; fall back to a synthesised one so the link is
        // always openable even if the payload omitted `url`.
        const url = commit.url ?? this.fallbackCommitUrl(provider, commit.repoSlug, commit.sha);
        await this.db.insert(db_1.taskExternalLinks).values({
            taskId,
            workspaceId,
            provider,
            kind: 'commit',
            url,
            externalId: fields.externalId,
            title: fields.title,
            status: null,
            metadata: {
                ref: fields.ref,
                source: 'push_webhook',
                autoLinked: true,
                message: commit.message.split('\n')[0]?.slice(0, 500) ?? null,
                author: commit.authorName,
            },
            // No owning user — the link was created by an inbound webhook, not a member.
            createdById: null,
        });
        return true;
    }
    fallbackCommitUrl(provider, repoSlug, sha) {
        if (!repoSlug)
            return sha;
        return provider === 'github'
            ? `https://github.com/${repoSlug}/commit/${sha}`
            : `https://gitlab.com/${repoSlug}/-/commit/${sha}`;
    }
};
exports.GitCommitLinksService = GitCommitLinksService;
exports.GitCommitLinksService = GitCommitLinksService = GitCommitLinksService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], GitCommitLinksService);
//# sourceMappingURL=git-commit-links.service.js.map