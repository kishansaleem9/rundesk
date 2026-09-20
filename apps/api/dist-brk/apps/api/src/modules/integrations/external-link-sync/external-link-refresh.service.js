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
var ExternalLinkRefreshService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalLinkRefreshService = exports.REFRESHABLE_PROVIDERS = exports.REFRESHABLE_KINDS = void 0;
exports.selectStaleLinks = selectStaleLinks;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../../common/database/database.module");
const safe_fetch_1 = require("../../../common/http/safe-fetch");
/**
 * §12.2 (+ §12.8) — periodic background sync that keeps existing task↔external
 * links current WITHOUT a manual refresh click: it re-fetches metadata/state
 * for links whose provider is connected — Google Drive / Dropbox file names,
 * GitHub / GitLab PR & issue open/merged/closed state.
 *
 * Design notes:
 *   • Only refreshable kinds are considered (PR/issue have live state; files
 *     have a live name). Commits, meetings, recordings and generic links are
 *     immutable / have nothing to poll, so they're excluded.
 *   • Env-gated on the *provider connection*: a link is only refreshed when its
 *     workspace has that provider connected (grouped so each connection is
 *     looked up once per run). Unconnected links are left untouched.
 *   • Rate-limit friendly: at most BATCH_SIZE links per run, processed
 *     sequentially, and each link is only revisited once it's older than
 *     MAX_AGE_HOURS (tracked via `metadata.lastRefreshedAt`, since the table
 *     has no updated_at column and we must not add a migration).
 */
/** Link kinds that have something live to re-fetch. */
exports.REFRESHABLE_KINDS = ['pull_request', 'issue', 'file'];
/** Providers with a live metadata/state endpoint. */
exports.REFRESHABLE_PROVIDERS = ['github', 'gitlab', 'google_drive', 'dropbox'];
/** How stale a link must be before it's eligible for a re-fetch. */
const MAX_AGE_HOURS = 6;
/** Hard cap on links refreshed per run (rate-limit friendly). */
const BATCH_SIZE = 50;
/** Candidate rows pulled from the DB before staleness filtering. */
const CANDIDATE_POOL = 500;
/**
 * Pure selection: from a candidate pool, pick the links that are "stale enough"
 * to re-fetch, oldest-refreshed first, capped at `batchSize`. A link's age is
 * measured from `metadata.lastRefreshedAt` when present, else its `createdAt`.
 * Exported + side-effect free so the cadence/selection is unit-testable without
 * a DB or provider.
 */
function selectStaleLinks(links, now, maxAgeHours = MAX_AGE_HOURS, batchSize = BATCH_SIZE) {
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const refreshedAt = (link) => {
        const raw = link.metadata?.lastRefreshedAt;
        if (typeof raw === 'string' || raw instanceof Date) {
            const t = new Date(raw).getTime();
            if (!Number.isNaN(t))
                return t;
        }
        return link.createdAt instanceof Date ? link.createdAt.getTime() : new Date(link.createdAt).getTime();
    };
    return links
        .filter((l) => now.getTime() - refreshedAt(l) >= maxAgeMs)
        .sort((a, b) => refreshedAt(a) - refreshedAt(b))
        .slice(0, batchSize);
}
/** external-link provider → integration-connection provider key. */
function connectionProviderFor(provider) {
    return provider === 'google_drive' ? 'google-drive' : provider;
}
let ExternalLinkRefreshService = ExternalLinkRefreshService_1 = class ExternalLinkRefreshService {
    constructor(db) {
        this.db = db;
        this.logger = new common_1.Logger(ExternalLinkRefreshService_1.name);
    }
    async runHourly() {
        return this.refreshStale(new Date());
    }
    /**
     * One sync pass: load a candidate pool, pick the stale batch, group by
     * workspace+provider, and re-fetch each group whose connection is configured.
     */
    async refreshStale(now = new Date()) {
        const summary = {
            scanned: 0,
            selected: 0,
            refreshed: 0,
            skippedNoConnection: 0,
            failed: 0,
        };
        const candidates = (await this.db
            .select({
            id: db_1.taskExternalLinks.id,
            workspaceId: db_1.taskExternalLinks.workspaceId,
            provider: db_1.taskExternalLinks.provider,
            kind: db_1.taskExternalLinks.kind,
            title: db_1.taskExternalLinks.title,
            status: db_1.taskExternalLinks.status,
            createdAt: db_1.taskExternalLinks.createdAt,
            metadata: db_1.taskExternalLinks.metadata,
        })
            .from(db_1.taskExternalLinks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(db_1.taskExternalLinks.kind, [...exports.REFRESHABLE_KINDS]), (0, drizzle_orm_1.inArray)(db_1.taskExternalLinks.provider, [...exports.REFRESHABLE_PROVIDERS])))
            .orderBy((0, drizzle_orm_1.asc)(db_1.taskExternalLinks.createdAt))
            .limit(CANDIDATE_POOL));
        summary.scanned = candidates.length;
        const selected = selectStaleLinks(candidates, now);
        summary.selected = selected.length;
        if (selected.length === 0)
            return summary;
        // Resolve each workspace+provider connection token once.
        const tokenCache = new Map();
        for (const link of selected) {
            const provider = link.provider;
            const cacheKey = `${link.workspaceId}:${provider}`;
            let token = tokenCache.get(cacheKey);
            if (token === undefined) {
                token = await this.loadConnectionToken(link.workspaceId, connectionProviderFor(provider));
                tokenCache.set(cacheKey, token);
            }
            if (!token) {
                summary.skippedNoConnection += 1;
                continue;
            }
            try {
                const ref = link.metadata?.ref ?? {};
                const enriched = await this.fetchState(provider, link.kind, ref, token);
                await this.persist(link, enriched, now);
                if (enriched)
                    summary.refreshed += 1;
            }
            catch {
                summary.failed += 1;
                // Still stamp lastRefreshedAt so a persistently-failing link doesn't get
                // retried every single run (don't hammer).
                await this.persist(link, null, now).catch(() => undefined);
            }
        }
        if (summary.refreshed > 0) {
            this.logger.log(`Refreshed ${summary.refreshed} external link(s) (scanned ${summary.scanned})`);
        }
        return summary;
    }
    /** Write back the refreshed state, always bumping `metadata.lastRefreshedAt`. */
    async persist(link, enriched, now) {
        const metadata = {
            ...(link.metadata ?? {}),
            lastRefreshedAt: now.toISOString(),
        };
        if (enriched?.metadata)
            Object.assign(metadata, enriched.metadata);
        await this.db
            .update(db_1.taskExternalLinks)
            .set({
            status: enriched?.status ?? link.status,
            title: enriched?.title ?? link.title,
            metadata,
        })
            .where((0, drizzle_orm_1.eq)(db_1.taskExternalLinks.id, link.id));
    }
    /** Stored access token for a connected provider in a workspace, else null. */
    async loadConnectionToken(workspaceId, connectionProvider) {
        const [conn] = await this.db
            .select({
            status: db_1.workspaceIntegrationConnections.status,
            accessToken: db_1.workspaceIntegrationConnections.accessToken,
        })
            .from(db_1.workspaceIntegrationConnections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.provider, connectionProvider)))
            .limit(1);
        if (!conn || conn.status !== 'connected' || !conn.accessToken)
            return null;
        return conn.accessToken;
    }
    /**
     * Env-gated live fetch, mirroring TasksService's per-link enrichment so the
     * cron and the manual "refresh" button produce identical status/title/metadata.
     * Returns null when the kind isn't fetchable or the remote call fails.
     */
    async fetchState(provider, kind, ref, token) {
        if (provider === 'github' && (kind === 'pull_request' || kind === 'issue')) {
            return this.fetchGithubState(kind, ref, token);
        }
        if (provider === 'gitlab' && (kind === 'pull_request' || kind === 'issue')) {
            return this.fetchGitlabState(kind, ref, token);
        }
        if (provider === 'google_drive' && kind === 'file') {
            return this.fetchDriveFile(ref, token);
        }
        if (provider === 'dropbox' && kind === 'file') {
            return this.fetchDropboxFile(ref, token);
        }
        return null;
    }
    async fetchGithubState(kind, ref, token) {
        if (!ref.owner || !ref.repo || !ref.number)
            return null;
        const base = process.env.GITHUB_API_URL ?? 'https://api.github.com';
        const path = kind === 'pull_request' ? 'pulls' : 'issues';
        // Fixed/operator host (not user-derived), but routed through safeFetch for
        // defense-in-depth: blocks private/reserved IPs + DNS rebinding on the sink.
        const res = await (0, safe_fetch_1.safeFetch)(`${base}/repos/${ref.owner}/${ref.repo}/${path}/${ref.number}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
            timeoutMs: 15_000,
        });
        if (res.status < 200 || res.status >= 300)
            return null;
        const body = JSON.parse(res.text());
        const status = kind === 'pull_request'
            ? body.merged || body.merged_at
                ? 'merged'
                : body.state === 'closed'
                    ? 'closed'
                    : 'open'
            : body.state === 'closed'
                ? 'closed'
                : 'open';
        return { status, title: body.title ?? null, metadata: { state: body.state ?? null } };
    }
    /**
     * Hosts the GitLab refresh may send the workspace OAuth token to: gitlab.com
     * plus any operator-approved self-hosted hosts from GITLAB_ALLOWED_HOSTS
     * (comma-separated, default none). Read per-call so operators can change the
     * allowlist without a code change; lowercased for case-insensitive matching.
     * Kept identical to TasksService.gitlabAllowedHosts so the cron and the manual
     * "refresh" button honour the same allowlist.
     */
    gitlabAllowedHosts() {
        const hosts = new Set(['gitlab.com']);
        for (const raw of (process.env.GITLAB_ALLOWED_HOSTS ?? '').split(',')) {
            const h = raw.trim().toLowerCase();
            if (h)
                hosts.add(h);
        }
        return hosts;
    }
    async fetchGitlabState(kind, ref, token) {
        if (!ref.projectPath || !ref.number)
            return null;
        // SSRF / token-exfiltration guard: `ref.host` is derived from the pasted URL,
        // so it must NEVER be used verbatim as the target of an authenticated request
        // (a member could paste https://gitlab.evil.com/... and — on the next cron
        // run — the workspace's GitLab token would be sent there). Only reach
        // gitlab.com or an operator-approved host; anything else is skipped WITHOUT
        // sending the token. safeFetch additionally pins DNS and blocks private/
        // reserved IPs (incl. cloud metadata) on every redirect hop.
        const allowedHostnames = this.gitlabAllowedHosts();
        const host = (ref.host ?? 'gitlab.com').toLowerCase();
        if (!allowedHostnames.has(host))
            return null;
        const apiBase = host === 'gitlab.com'
            ? process.env.GITLAB_API_URL ?? 'https://gitlab.com/api/v4'
            : `https://${host}/api/v4`;
        const encoded = encodeURIComponent(ref.projectPath);
        const path = kind === 'pull_request' ? 'merge_requests' : 'issues';
        const res = await (0, safe_fetch_1.safeFetch)(`${apiBase}/projects/${encoded}/${path}/${ref.number}`, {
            headers: { Authorization: `Bearer ${token}` },
            allowedHostnames,
            timeoutMs: 15_000,
        });
        if (res.status < 200 || res.status >= 300)
            return null;
        const body = JSON.parse(res.text());
        const status = body.state === 'merged'
            ? 'merged'
            : body.state === 'closed' || body.state === 'locked'
                ? 'closed'
                : 'open';
        return { status, title: body.title ?? null, metadata: { state: body.state ?? null } };
    }
    async fetchDriveFile(ref, token) {
        if (!ref.fileId)
            return null;
        const base = process.env.GOOGLE_DRIVE_API_URL ?? 'https://www.googleapis.com/drive/v3';
        // Fixed/operator host; routed through safeFetch for defense-in-depth.
        const res = await (0, safe_fetch_1.safeFetch)(`${base}/files/${ref.fileId}?fields=id,name,mimeType,thumbnailLink,webViewLink,iconLink`, { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 15_000 });
        if (res.status < 200 || res.status >= 300)
            return null;
        const body = JSON.parse(res.text());
        return {
            status: null,
            title: body.name ?? null,
            metadata: {
                mimeType: body.mimeType ?? null,
                thumbnailLink: body.thumbnailLink ?? null,
                iconLink: body.iconLink ?? null,
            },
        };
    }
    async fetchDropboxFile(ref, token) {
        if (!ref.sharedUrl)
            return null;
        const base = process.env.DROPBOX_API_URL ?? 'https://api.dropboxapi.com/2';
        // Fixed/operator host; routed through safeFetch for defense-in-depth.
        const res = await (0, safe_fetch_1.safeFetch)(`${base}/sharing/get_shared_link_metadata`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: ref.sharedUrl }),
            timeoutMs: 15_000,
        });
        if (res.status < 200 || res.status >= 300)
            return null;
        const body = JSON.parse(res.text());
        return {
            status: null,
            title: body.name ?? null,
            metadata: { dropboxType: body['.tag'] ?? null, size: body.size ?? null },
        };
    }
};
exports.ExternalLinkRefreshService = ExternalLinkRefreshService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR, { name: 'external-link-refresh' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ExternalLinkRefreshService.prototype, "runHourly", null);
exports.ExternalLinkRefreshService = ExternalLinkRefreshService = ExternalLinkRefreshService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ExternalLinkRefreshService);
//# sourceMappingURL=external-link-refresh.service.js.map