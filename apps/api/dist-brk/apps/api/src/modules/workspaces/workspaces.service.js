"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspacesService = exports.MAX_LOGO_BYTES = void 0;
exports.computeOnboardingSteps = computeOnboardingSteps;
exports.normalizeHost = normalizeHost;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const crypto = __importStar(require("crypto"));
const node_crypto_1 = require("node:crypto");
const dns = __importStar(require("dns"));
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const item_visibility_1 = require("../../common/permissions/item-visibility");
const r2_service_1 = require("../../common/storage/r2.service");
const security_service_1 = require("../security/security.service");
const webhooks_service_1 = require("../webhooks/webhooks.service");
const plans_service_1 = require("../plans/plans.service");
const BASE_SLUG_FALLBACK = 'workspace';
/** Image content types accepted for a workspace logo upload (Plan §13.5). */
const LOGO_CONTENT_TYPES = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
};
/** Hard cap on an uploaded workspace logo. */
exports.MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB
function slugify(input) {
    return input
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
        .slice(0, 40) || BASE_SLUG_FALLBACK;
}
/**
 * Pure done-state computation for the onboarding checklist — kept side-effect
 * free so it is unit-testable without a database. A step is "done" the moment
 * the workspace has real data proving it, so steps auto-check as the user works.
 */
function computeOnboardingSteps(counts) {
    return {
        space: counts.spaces > 0,
        project: counts.projects > 0,
        task: counts.tasks > 0,
        // The workspace creator is always a member; a second member means an
        // invite was accepted (or a member added), so "invite a teammate" is done.
        invite: counts.members > 1,
        ai: counts.aiEvents > 0,
    };
}
/**
 * Normalize an HTTP `Host` (or a stored custom domain) to a canonical
 * comparison key: trimmed, lowercased, scheme/path stripped, port stripped,
 * trailing FQDN dot removed, and a single leading `www.` removed. Applied to
 * BOTH sides of a custom-domain match so "Example.com:443", "www.example.com"
 * and "example.com" all resolve to the same workspace — and so it does not
 * matter whether the owner saved the bare or the `www.` form. Returns '' when
 * there is nothing usable to match on.
 */
function normalizeHost(host) {
    if (!host)
        return '';
    let h = host.trim().toLowerCase();
    if (!h)
        return '';
    h = h.replace(/^https?:\/\//, ''); // drop scheme if a full URL was passed (defensive)
    h = h.split('/')[0] ?? ''; // drop any path/query segment
    h = h.replace(/:\d+$/, ''); // strip port: example.com:443 -> example.com
    h = h.replace(/\.$/, ''); // strip trailing FQDN root dot
    h = h.replace(/^www\./, ''); // strip a single leading www.
    return h;
}
/**
 * §7 — what a brand-new workspace opens with.
 *
 * "Ab agar maine workspace banayi to yeh mere par dependent hai ke maine apne
 * members ko share karna hai ya nahi karna" [09:43]: it is theirs to fill. But
 * an empty workspace has no space, so no project, so no list — and the sidebar,
 * the create modal and every list view all have nothing to show. One of each is
 * the smallest arrangement where the product works on arrival, and all of it
 * can be renamed or deleted.
 *
 * Keyed off the purpose the flow just asked for, because that is the point of
 * asking. 'Personal' and 'Work' want different first words.
 */
const STARTER_CONTENT = {
    work: { space: 'Team', project: 'Projects', list: 'To do' },
    personal: { space: 'Personal', project: 'My projects', list: 'To do' },
    school: { space: 'Study', project: 'Courses', list: 'Assignments' },
    default: { space: 'Space', project: 'Projects', list: 'To do' },
};
let WorkspacesService = class WorkspacesService {
    constructor(db, security, webhooks, r2, plans) {
        this.db = db;
        this.security = security;
        this.webhooks = webhooks;
        this.r2 = r2;
        this.plans = plans;
    }
    /**
     * Best-effort webhook fan-out (Plan §12.4). Mirrors the webhooks portion of
     * TasksService.fireTaskEvent — non-blocking, failures logged not thrown, so
     * a downed webhook can never break a membership mutation.
     */
    async fireWebhook(workspaceId, event, payload) {
        try {
            await this.webhooks.fire(workspaceId, event, payload);
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error(`[webhooks.fire] ${event} failed:`, e);
        }
    }
    /**
     * A member's own workspaces, oldest membership first.
     *
     * THE ORDER IS NOT COSMETIC. This query had no `ORDER BY` at all, and
     * Postgres is free to return an unordered join in whatever order the plan
     * produces — which changes as rows are updated, as the planner switches
     * scan types, and after a vacuum. Eight surfaces render this list, so a
     * person's workspace switcher could reshuffle between two page loads for
     * no reason they could see.
     *
     * `joinedAt` ASC, deliberately matching
     * `WorkspaceSecuritySettingsService.getEffectiveForUser`, which already
     * ordered by it. Those two now agree on which workspace is "first", and
     * "first in your switcher" is the same workspace as "the one whose
     * security policy governs your session" — which is the only defensible
     * reading of a list that a security decision is taken from.
     */
    async findByMember(userId) {
        return this.db
            .select({ workspace: db_1.workspaces, role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, db_1.workspaces.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId), (0, drizzle_orm_1.eq)(db_1.workspaces.isArchived, false)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.workspaceMembers.joinedAt));
    }
    /** Soft-delete (archive) a workspace so it disappears from members' lists. */
    async archiveWorkspace(workspaceId, actor) {
        const [row] = await this.db
            .update(db_1.workspaces)
            .set({ isArchived: true, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Workspace not found');
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor?.id,
            actorEmail: actor?.email,
            ipAddress: actor?.ip,
            action: 'workspace.archived',
            resourceType: 'workspace',
            resourceId: workspaceId,
            description: 'Workspace archived (soft-deleted)',
        });
        return row;
    }
    async restoreWorkspace(workspaceId, actor) {
        const [row] = await this.db
            .update(db_1.workspaces)
            .set({ isArchived: false, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Workspace not found');
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor?.id,
            actorEmail: actor?.email,
            ipAddress: actor?.ip,
            action: 'workspace.restored',
            resourceType: 'workspace',
            resourceId: workspaceId,
            description: 'Workspace restored from archive',
        });
        return row;
    }
    /**
     * Archived workspaces the user still belongs to (Plan §13.4). The regular
     * `/workspaces` list hides these; the settings "Archived" area surfaces them
     * so an admin can restore one. Restore itself is admin-guarded.
     */
    async listArchivedWorkspaces(userId) {
        return this.db
            .select({ workspace: db_1.workspaces, role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, db_1.workspaces.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId), (0, drizzle_orm_1.eq)(db_1.workspaces.isArchived, true)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.workspaces.updatedAt));
    }
    /**
     * Archived (soft-deleted) tasks across a workspace (Plan §13.4). Joined up the
     * task → list → project → space tree so we can scope by workspace and show the
     * list/project a task belongs to. Restore uses the existing task-restore route.
     */
    async listArchivedTasks(workspaceId, actor) {
        // §2 per-item privacy: drop private tasks the actor may not see. Admin /
        // super-admin callers resolve as managers (undefined filter) and still see all.
        const visFilter = actor
            ? (0, item_visibility_1.taskVisibilityFilter)(this.db, actor.id, await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, actor.id, actor.role))
            : undefined;
        return this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            listId: db_1.tasks.listId,
            listName: db_1.lists.name,
            projectName: db_1.projects.name,
            updatedAt: db_1.tasks.updatedAt,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.tasks.listId, db_1.lists.id))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.lists.projectId, db_1.projects.id))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.projects.spaceId, db_1.spaces.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, true), visFilter))
            .orderBy((0, drizzle_orm_1.desc)(db_1.tasks.updatedAt))
            .limit(200);
    }
    /**
     * Presign a direct-to-R2 PUT for a workspace logo (Plan §13.5). Mirrors the
     * avatar/clip presign flow: validate image type + size, return a short-lived
     * upload URL plus the public URL the client persists via PATCH /workspaces/:id
     * (logoUrl). Keys live under `workspace-logos/<workspaceId>-<rand>.<ext>`.
     */
    async createLogoUploadUrl(workspaceId, body) {
        if (!this.r2.configured)
            throw new common_1.BadRequestException('R2 storage is not configured');
        const contentType = (body.contentType || '').toLowerCase();
        const ext = LOGO_CONTENT_TYPES[contentType];
        if (!ext) {
            throw new common_1.BadRequestException('Only image files (PNG, JPEG, WebP, GIF, or SVG) are allowed');
        }
        if (body.sizeBytes != null && Number.isFinite(body.sizeBytes) && body.sizeBytes > exports.MAX_LOGO_BYTES) {
            const mb = Math.round(exports.MAX_LOGO_BYTES / (1024 * 1024));
            throw new common_1.BadRequestException(`Logo image exceeds the ${mb} MB limit`);
        }
        const key = `workspace-logos/${workspaceId}-${(0, node_crypto_1.randomBytes)(8).toString('hex')}.${ext}`;
        const uploadUrl = await this.r2.presignPutObject(key, contentType, { workspaceid: workspaceId });
        const publicUrl = await this.r2.getObjectUrl(key);
        return { uploadUrl, publicUrl, storageKey: key };
    }
    async findById(id) {
        const [ws] = await this.db.select().from(db_1.workspaces).where((0, drizzle_orm_1.eq)(db_1.workspaces.id, id));
        return ws ?? null;
    }
    async getMembership(workspaceId, userId) {
        const [row] = await this.db
            .select()
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)));
        return row ?? null;
    }
    async update(workspaceId, patch, actor) {
        const set = { ...patch, updatedAt: new Date() };
        // §A4.2 — a policy switch decides who can see client work, so a truthy-ish
        // body value ("false", 0) must never be read as "on".
        if (patch.defaultSpacePrivate !== undefined)
            set.defaultSpacePrivate = patch.defaultSpacePrivate === true;
        if (patch.blockPublicSharing !== undefined)
            set.blockPublicSharing = patch.blockPublicSharing === true;
        // Changing the custom domain (re)mints a verification token and resets the
        // verified flag (Plan §13).
        if ('customDomain' in patch) {
            const [current] = await this.db
                .select({ customDomain: db_1.workspaces.customDomain })
                .from(db_1.workspaces)
                .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
                .limit(1);
            const nextDomain = (patch.customDomain ?? '').trim() || null;
            set.customDomain = nextDomain;
            if ((current?.customDomain ?? null) !== nextDomain) {
                set.customDomainToken = nextDomain ? `rundesk-verify=${crypto.randomBytes(16).toString('hex')}` : null;
                set.customDomainVerified = false;
            }
        }
        const [row] = await this.db
            .update(db_1.workspaces)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Workspace not found');
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor?.id,
            actorEmail: actor?.email,
            ipAddress: actor?.ip,
            action: 'workspace.updated',
            resourceType: 'workspace',
            resourceId: workspaceId,
            description: `Workspace settings updated`,
            metadata: {
                name: patch.name ?? null,
                logoUrl: patch.logoUrl ?? null,
                primaryColor: patch.primaryColor ?? null,
                accentColor: patch.accentColor ?? null,
                customDomain: patch.customDomain ?? null,
            },
        });
        return row;
    }
    /**
     * Verify a workspace's custom domain by looking for the verification token in
     * a TXT record at _rundesk-verify.<domain> (Plan §13).
     */
    async verifyCustomDomain(workspaceId) {
        const [ws] = await this.db.select().from(db_1.workspaces).where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId)).limit(1);
        if (!ws)
            throw new common_1.NotFoundException('Workspace not found');
        if (!ws.customDomain || !ws.customDomainToken) {
            throw new common_1.BadRequestException('Set a custom domain first');
        }
        const host = `_rundesk-verify.${ws.customDomain}`;
        let verified = false;
        try {
            const records = await dns.promises.resolveTxt(host);
            verified = records.some((chunks) => chunks.join('').includes(ws.customDomainToken));
        }
        catch {
            verified = false;
        }
        await this.db
            .update(db_1.workspaces)
            .set({ customDomainVerified: verified, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId));
        return { verified, host, expectedTxt: ws.customDomainToken };
    }
    /**
     * Resolve an incoming request `Host` to the workspace that serves it via a
     * VERIFIED custom domain (Plan §13.5 / §2.2). This is the app-layer half of
     * custom domains: `verifyCustomDomain` proves ownership over a DNS TXT record,
     * and this turns a Host header into the branded entry point the SPA boots
     * into. Nothing else in the app previously mapped a Host to a workspace.
     *
     * The match is symmetric — `normalizeHost` is applied to both the incoming
     * Host and each stored `custom_domain` — so case, port, a leading `www.`, and
     * whether the owner saved "example.com" or "www.example.com" never matter. A
     * domain only resolves while it is verified AND its workspace is not archived.
     *
     * Returns a SAFE PUBLIC projection only (id, name, slug, logoUrl,
     * primaryColor, accentColor, customDomain); members, the verification token,
     * plan limits and every other internal column are never returned. Returns
     * null when no verified, non-archived workspace claims the host.
     *
     * TLS: certificate ACME/issuance/storage stays a reverse-proxy concern, but
     * the app now owns the AUTHORIZATION half of it. `isCustomDomainAuthorized`
     * (exposed at `GET /public/tls/authorize`) lets a TLS-terminating proxy ask,
     * per incoming Host, whether to obtain a certificate — answered "yes" only for
     * the very hosts this method would serve. Custom-domain HTTPS is therefore
     * fully automatic in production with no per-domain manual cert step: the app
     * decides which hosts are eligible; the proxy performs ACME and stores certs.
     */
    async resolveByCustomDomain(host) {
        const normalized = normalizeHost(host);
        if (!normalized)
            return null;
        // Only workspaces that actually set a custom domain are candidates — a tiny
        // set. We fetch the two guard flags alongside the safe columns and evaluate
        // the match in JS so the SAME normalization applies to the stored domain and
        // the incoming Host (a plain SQL equality could not compare them
        // symmetrically). The SELECT lists only safe columns, so the verification
        // token, plan limits and members are never even read.
        const rows = await this.db
            .select({
            id: db_1.workspaces.id,
            name: db_1.workspaces.name,
            slug: db_1.workspaces.slug,
            logoUrl: db_1.workspaces.logoUrl,
            primaryColor: db_1.workspaces.primaryColor,
            accentColor: db_1.workspaces.accentColor,
            customDomain: db_1.workspaces.customDomain,
            customDomainVerified: db_1.workspaces.customDomainVerified,
            isArchived: db_1.workspaces.isArchived,
        })
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.isNotNull)(db_1.workspaces.customDomain));
        const match = rows.find((w) => w.customDomainVerified &&
            !w.isArchived &&
            normalizeHost(w.customDomain) === normalized);
        if (!match)
            return null;
        return {
            id: match.id,
            name: match.name,
            slug: match.slug,
            logoUrl: match.logoUrl,
            primaryColor: match.primaryColor,
            accentColor: match.accentColor,
            customDomain: match.customDomain,
        };
    }
    /**
     * On-demand-TLS authorization decision for a TLS-terminating reverse proxy
     * (Plan §13.5 / §2.2). Returns true IF AND ONLY IF `host` is the VERIFIED
     * custom domain of a live (non-archived) workspace — i.e. exactly the set of
     * hosts the app is willing to serve. It DELEGATES to `resolveByCustomDomain`
     * (same `normalizeHost` canonicalization, same verified + non-archived guards)
     * so the certificate-issuance decision can NEVER diverge from the
     * Host -> workspace serving decision: if the app serves a host it authorizes a
     * certificate for it, and if it does not it refuses. An unverified, unknown,
     * archived, or blank host returns false — which is what stops a proxy from
     * being steered into requesting ACME certificates for arbitrary
     * attacker-supplied domains.
     *
     * See `WorkspacesPublicController.authorizeTls` for the public HTTP "ask"
     * contract a proxy (e.g. Caddy `on_demand_tls`) calls to reach this decision.
     */
    async isCustomDomainAuthorized(host) {
        return (await this.resolveByCustomDomain(host)) !== null;
    }
    /**
     * The People roster (§A4.1). Beyond the membership row it carries the three
     * columns an admin actually audits by — who invited this person, when, and how
     * recently they were here — plus the teams they belong to. Invites are
     * org-scoped, so provenance is joined through the accepted invitation for this
     * workspace's organization; a founding member or one added by hand simply has
     * no invitation and reports null.
     */
    /**
     * Which days the workspace actually works, plus the dates it does not.
     *
     * Capacity was already stored per member; what nothing knew was how those
     * hours are spread. A Sun–Thu week read as two days of overtime and two days
     * idle before this existed.
     */
    async getWorkSchedule(workspaceId) {
        const [ws] = await this.db
            .select({ workDays: db_1.workspaces.workDays })
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
            .limit(1);
        if (!ws)
            throw new common_1.NotFoundException('Workspace not found');
        const holidays = await this.db
            .select({ id: db_1.workspaceHolidays.id, day: db_1.workspaceHolidays.day, name: db_1.workspaceHolidays.name })
            .from(db_1.workspaceHolidays)
            .where((0, drizzle_orm_1.eq)(db_1.workspaceHolidays.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.workspaceHolidays.day));
        return { workDays: ws.workDays ?? [1, 2, 3, 4, 5], holidays };
    }
    async setWorkDays(workspaceId, days, actor) {
        if (!Array.isArray(days))
            throw new common_1.BadRequestException('workDays must be an array');
        // ISO weekdays: Monday is 1 and Sunday is 7. Say so, because JavaScript's
        // own getDay() puts Sunday at 0 and silently dropping it would hand back a
        // 200 and a schedule missing the day the caller asked for.
        const numbers = days.map((d) => Number(d));
        const invalid = numbers.filter((d) => !Number.isInteger(d) || d < 1 || d > 7);
        if (invalid.length) {
            throw new common_1.BadRequestException(`workDays must be ISO weekdays 1–7 (Monday–Sunday); got ${[...new Set(invalid)].join(', ')}`);
        }
        // De-duplicated and ordered, so downstream code can treat the column as a
        // canonical set rather than whatever arrived over the wire.
        const clean = [...new Set(numbers)].sort();
        if (clean.length === 0)
            throw new common_1.BadRequestException('Pick at least one working day');
        await this.db
            .update(db_1.workspaces)
            .set({ workDays: clean, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId));
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor?.id,
            actorEmail: actor?.email,
            ipAddress: actor?.ip,
            action: 'workspace.work_days_updated',
            resourceType: 'workspace',
            resourceId: workspaceId,
            description: `Working days set to ${clean.join(', ')}`,
            // Audit metadata is scalar-valued, so the set is stored as a stable string.
            metadata: { workDays: clean.join(',') },
        });
        return { ok: true, workDays: clean };
    }
    async addHoliday(workspaceId, day, name, actor) {
        const clean = (day ?? '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(clean))
            throw new common_1.BadRequestException('day must be YYYY-MM-DD');
        const label = (name ?? '').trim();
        if (!label)
            throw new common_1.BadRequestException('name is required');
        const [existing] = await this.db
            .select({ id: db_1.workspaceHolidays.id })
            .from(db_1.workspaceHolidays)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceHolidays.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceHolidays.day, clean)))
            .limit(1);
        if (existing)
            throw new common_1.ConflictException('That date is already a holiday');
        const [row] = await this.db
            .insert(db_1.workspaceHolidays)
            .values({ workspaceId, day: clean, name: label })
            .returning();
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor?.id,
            actorEmail: actor?.email,
            ipAddress: actor?.ip,
            action: 'workspace.holiday_added',
            resourceType: 'workspace',
            resourceId: workspaceId,
            description: `Holiday added: ${label} (${clean})`,
            metadata: { day: clean, name: label },
        });
        return row;
    }
    async removeHoliday(workspaceId, holidayId, actor) {
        const [row] = await this.db
            .delete(db_1.workspaceHolidays)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceHolidays.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceHolidays.id, holidayId)))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Holiday not found');
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor?.id,
            actorEmail: actor?.email,
            ipAddress: actor?.ip,
            action: 'workspace.holiday_removed',
            resourceType: 'workspace',
            resourceId: workspaceId,
            description: `Holiday removed: ${row.name} (${row.day})`,
            metadata: { day: row.day, name: row.name },
        });
        return { ok: true };
    }
    async listMembers(workspaceId) {
        const rows = await this.db
            .select({
            userId: db_1.users.id,
            workspaceMemberId: db_1.workspaceMembers.id,
            email: db_1.users.email,
            displayName: db_1.users.displayName,
            avatarUrl: db_1.users.avatarUrl,
            role: db_1.workspaceMembers.role,
            weeklyCapacityHours: db_1.workspaceMembers.weeklyCapacityHours,
            managerId: db_1.workspaceMembers.managerId,
            joinedAt: db_1.workspaceMembers.joinedAt,
            lastSeenAt: db_1.users.lastSeenAt,
            /*
             * §G06 [05:46] — "mera TIME ZONE kya chal raha hai".
             *
             * Stored since forever and used server-side for quiet hours, and this
             * read did not select it — so no surface in the product could show a
             * colleague's local time even though the app knew it. One column.
             */
            timezone: db_1.users.timezone,
            // §G06 [06:42] — the sentence, so a roster can show it beside the name.
            statusEmoji: db_1.users.statusEmoji,
            statusText: db_1.users.statusText,
            statusExpiresAt: db_1.users.statusExpiresAt,
            organizationId: db_1.workspaces.organizationId,
        })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
            .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaces.id, db_1.workspaceMembers.workspaceId))
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId));
        // Provenance is a separate read rather than a join: someone re-invited after
        // a removal has more than one accepted invitation, and joining would fan the
        // roster out into duplicate rows. Ordering ascending and letting later rows
        // overwrite leaves the most recent invite per person.
        const organizationId = rows[0]?.organizationId;
        const inviter = (0, pg_core_1.alias)(db_1.users, 'inviter');
        const inviteRows = organizationId
            ? await this.db
                .select({
                userId: db_1.invitations.acceptedByUserId,
                invitedAt: db_1.invitations.createdAt,
                invitedByName: inviter.displayName,
                invitedByEmail: inviter.email,
            })
                .from(db_1.invitations)
                .leftJoin(inviter, (0, drizzle_orm_1.eq)(inviter.id, db_1.invitations.invitedByUserId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.invitations.organizationId, organizationId), (0, drizzle_orm_1.isNotNull)(db_1.invitations.acceptedByUserId)))
                .orderBy((0, drizzle_orm_1.asc)(db_1.invitations.createdAt))
            : [];
        const inviteByUser = new Map(inviteRows.map((row) => [row.userId, row]));
        const teamRows = await this.db
            .select({ userId: db_1.workspaceGroupMembers.userId, name: db_1.workspaceGroups.name })
            .from(db_1.workspaceGroupMembers)
            .innerJoin(db_1.workspaceGroups, (0, drizzle_orm_1.eq)(db_1.workspaceGroups.id, db_1.workspaceGroupMembers.groupId))
            .where((0, drizzle_orm_1.eq)(db_1.workspaceGroups.workspaceId, workspaceId));
        const teamsByUser = new Map();
        for (const row of teamRows) {
            const list = teamsByUser.get(row.userId) ?? [];
            list.push(row.name);
            teamsByUser.set(row.userId, list);
        }
        // The manager is always another member of this same workspace, so the name
        // comes from the rows we already have rather than a second join.
        const nameByUser = new Map(rows.map((row) => [row.userId, row.displayName || row.email]));
        return rows.map(({ organizationId: _organizationId, ...row }) => {
            const invite = inviteByUser.get(row.userId);
            return {
                ...row,
                managerName: row.managerId ? nameByUser.get(row.managerId) ?? null : null,
                invitedAt: invite?.invitedAt ?? null,
                invitedByName: invite?.invitedByName ?? null,
                invitedByEmail: invite?.invitedByEmail ?? null,
                teams: teamsByUser.get(row.userId) ?? [],
            };
        });
    }
    /**
     * Set (or clear) who a member reports to.
     *
     * Two things must not happen: a person reporting to themselves, and a cycle —
     * A→B→A leaves the roster tree with a set of people who have a manager but no
     * root, so they vanish from the chart entirely. Both are rejected here rather
     * than papered over when rendering.
     */
    async updateMemberManager(workspaceId, userId, managerId, actor) {
        const member = await this.getMembership(workspaceId, userId);
        if (!member)
            throw new common_1.NotFoundException('Member not found');
        if (managerId) {
            if (managerId === userId)
                throw new common_1.BadRequestException('A member cannot report to themselves');
            const manager = await this.getMembership(workspaceId, managerId);
            if (!manager)
                throw new common_1.NotFoundException('Manager is not a member of this workspace');
            // Walk up from the proposed manager; if we reach this user, the edge closes
            // a loop. The visited set stops us spinning on a cycle that predates us.
            const rows = await this.db
                .select({ userId: db_1.workspaceMembers.userId, managerId: db_1.workspaceMembers.managerId })
                .from(db_1.workspaceMembers)
                .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId));
            const parentOf = new Map(rows.map((r) => [r.userId, r.managerId]));
            const seen = new Set([userId]);
            let cursor = managerId;
            while (cursor) {
                if (seen.has(cursor))
                    throw new common_1.BadRequestException('That would create a reporting loop');
                seen.add(cursor);
                cursor = parentOf.get(cursor) ?? null;
            }
        }
        await this.db
            .update(db_1.workspaceMembers)
            .set({ managerId })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)));
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor?.id,
            actorEmail: actor?.email,
            ipAddress: actor?.ip,
            action: 'member.manager_updated',
            resourceType: 'user',
            resourceId: userId,
            description: managerId ? 'Reporting line updated' : 'Reporting line cleared',
            metadata: { from: member.managerId ?? null, to: managerId },
        });
        return { ok: true, managerId };
    }
    async addMember(workspaceId, email, role = 'member', actor) {
        const [user] = await this.db.select().from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.email, email));
        if (!user)
            throw new common_1.BadRequestException(`No user with email ${email}`);
        const existing = await this.getMembership(workspaceId, user.id);
        if (existing)
            throw new common_1.ConflictException('User is already a member');
        // Plan §14.1: enforce the plan's member cap. No-op for enterprise (unlimited),
        // which is every existing workspace by default.
        await this.plans.assertCanAddMembers(workspaceId);
        await this.db.insert(db_1.workspaceMembers).values({
            workspaceId,
            userId: user.id,
            role: role,
        });
        // Keep the org directory consistent: any workspace member is also an org
        // member — the invariant the single-org tenant model relies on.
        const [ws] = await this.db
            .select({ organizationId: db_1.workspaces.organizationId })
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
            .limit(1);
        if (ws) {
            await this.db
                .insert(db_1.organizationMembers)
                .values({ organizationId: ws.organizationId, userId: user.id, role: 'member' })
                .onConflictDoNothing();
        }
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor?.id,
            actorEmail: actor?.email,
            ipAddress: actor?.ip,
            action: 'member.invited',
            resourceType: 'user',
            resourceId: user.id,
            description: `Added ${email} to workspace as ${role}`,
            metadata: { email, role },
        });
        // A direct add joins the member immediately (Plan §12.4). Best effort.
        void this.fireWebhook(workspaceId, 'member.joined', {
            workspaceId,
            userId: user.id,
            email,
            role,
            actorId: actor?.id ?? null,
        });
        return { ok: true, userId: user.id };
    }
    async updateMemberRole(workspaceId, userId, role, actor) {
        // Only these roles may be assigned to a workspace member. Crucially this
        // excludes `super_admin` (a platform-level role in the same enum) — without
        // this allowlist any workspace admin could self-promote to god-mode.
        const ASSIGNABLE_ROLES = ['workspace_admin', 'manager', 'member', 'guest'];
        if (!ASSIGNABLE_ROLES.includes(role)) {
            throw new common_1.BadRequestException(`Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(', ')}`);
        }
        const previous = await this.getMembership(workspaceId, userId);
        // Never let the last workspace admin be demoted out of the workspace.
        if (previous?.role === 'workspace_admin' && role !== 'workspace_admin') {
            const admins = await this.db
                .select({ userId: db_1.workspaceMembers.userId })
                .from(db_1.workspaceMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.role, 'workspace_admin')));
            if (admins.length <= 1) {
                throw new common_1.BadRequestException('Cannot demote the last workspace admin');
            }
        }
        await this.db
            .update(db_1.workspaceMembers)
            .set({ role: role })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)));
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor?.id,
            actorEmail: actor?.email,
            ipAddress: actor?.ip,
            action: 'role.changed',
            resourceType: 'user',
            resourceId: userId,
            description: `Member role changed to ${role}`,
            metadata: { from: previous?.role ?? null, to: role },
        });
        return { ok: true };
    }
    async updateMemberCapacity(workspaceId, userId, weeklyCapacityHours, actor) {
        if (!Number.isFinite(weeklyCapacityHours) || weeklyCapacityHours < 0 || weeklyCapacityHours > 168) {
            throw new common_1.BadRequestException('weeklyCapacityHours must be between 0 and 168');
        }
        const rounded = Math.round(weeklyCapacityHours);
        const previous = await this.getMembership(workspaceId, userId);
        if (!previous)
            throw new common_1.NotFoundException('Member not found');
        await this.db
            .update(db_1.workspaceMembers)
            .set({ weeklyCapacityHours: rounded })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)));
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor?.id,
            actorEmail: actor?.email,
            ipAddress: actor?.ip,
            action: 'member.capacity_updated',
            resourceType: 'user',
            resourceId: userId,
            description: `Weekly capacity set to ${rounded}h`,
            metadata: { from: previous.weeklyCapacityHours ?? null, to: rounded },
        });
        return { ok: true, weeklyCapacityHours: rounded };
    }
    async removeMember(workspaceId, userId, actor) {
        const member = await this.getMembership(workspaceId, userId);
        if (member?.role === 'workspace_admin') {
            const admins = await this.db
                .select({ userId: db_1.workspaceMembers.userId })
                .from(db_1.workspaceMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.role, 'workspace_admin')));
            if (admins.length <= 1) {
                throw new common_1.BadRequestException('Cannot remove the last workspace admin');
            }
        }
        // Their reports would otherwise point at someone no longer on the roster,
        // which hides that whole subtree. Orphan them to the root instead.
        await this.db
            .update(db_1.workspaceMembers)
            .set({ managerId: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.managerId, userId)));
        await this.db
            .delete(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)));
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor?.id,
            actorEmail: actor?.email,
            ipAddress: actor?.ip,
            action: 'member.removed',
            resourceType: 'user',
            resourceId: userId,
            description: `Removed member from workspace`,
        });
        void this.fireWebhook(workspaceId, 'member.removed', {
            workspaceId,
            userId,
            actorId: actor?.id ?? null,
        });
        return { ok: true };
    }
    async create(userId, dto) {
        const requestedSlug = slugify(dto.slug ?? dto.name);
        const finalSlug = await this.reserveUniqueSlug(requestedSlug);
        return this.db.transaction(async (tx) => {
            let orgId = dto.organizationId;
            if (orgId) {
                // Verify the caller belongs to the target organization.
                const [member] = await tx
                    .select({ id: db_1.organizationMembers.id })
                    .from(db_1.organizationMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, orgId), (0, drizzle_orm_1.eq)(db_1.organizationMembers.userId, userId)))
                    .limit(1);
                if (!member)
                    throw new common_1.ForbiddenException('Not a member of that organization');
            }
            else {
                // Attach the new workspace to the caller's existing organization — one
                // top-level org per tenant — rather than spawning a fresh org for every
                // workspace (the previous behaviour). Only create an org when the caller
                // genuinely has none (first-workspace path, mirroring signUp).
                const [existing] = await tx
                    .select({ organizationId: db_1.organizationMembers.organizationId })
                    .from(db_1.organizationMembers)
                    .where((0, drizzle_orm_1.eq)(db_1.organizationMembers.userId, userId))
                    .orderBy((0, drizzle_orm_1.asc)(db_1.organizationMembers.joinedAt))
                    .limit(1);
                if (existing) {
                    orgId = existing.organizationId;
                }
                else {
                    const [org] = await tx
                        .insert(db_1.organizations)
                        .values({ name: dto.name, slug: finalSlug })
                        .returning();
                    orgId = org.id;
                    await tx.insert(db_1.organizationMembers).values({
                        organizationId: org.id,
                        userId,
                        role: 'owner',
                    });
                }
            }
            const [workspace] = await tx
                .insert(db_1.workspaces)
                .values({
                organizationId: orgId,
                name: dto.name,
                slug: finalSlug,
                logoUrl: dto.logoUrl,
                primaryColor: dto.primaryColor,
                // §7 — kept, not discarded. Asking and then throwing the answer away
                // costs someone a step and buys them nothing.
                purpose: dto.purpose ?? null,
                comingFrom: dto.comingFrom ?? null,
            })
                .returning();
            await tx.insert(db_1.workspaceMembers).values({
                workspaceId: workspace.id,
                userId,
                role: 'workspace_admin',
            });
            // §1.1 — a workspace with no task types hides the type picker entirely,
            // so the feature would be invisible in every workspace created from here
            // on. Milestone is the one she named: "hum is ko 'task' ka naam nahi de
            // sakte — woh MILESTONE hai." Migration 0093 does the same for the
            // workspaces that already existed.
            await tx.insert(db_1.taskTypes).values(db_1.DEFAULT_TASK_TYPES.map((type) => ({ ...type, workspaceId: workspace.id })));
            /*
             * §7 — somewhere to land.
             *
             * A workspace created with nothing in it opens on an empty screen with no
             * obvious first move, which is the state the frame pass flagged. One
             * space, one project, one list is the smallest thing that makes the
             * sidebar, the create modal and the list view all work on arrival — and
             * it is all removable, so nobody is stuck with our guess.
             *
             * Named from the purpose she gave, because "Personal" and "Work" want
             * different first words and we just asked which it was.
             */
            const seed = STARTER_CONTENT[dto.purpose ?? ''] ?? STARTER_CONTENT.default;
            const [space] = await tx
                .insert(db_1.spaces)
                .values({ workspaceId: workspace.id, name: seed.space, createdById: userId })
                .returning();
            const [project] = await tx
                .insert(db_1.projects)
                .values({ spaceId: space.id, name: seed.project, createdById: userId })
                .returning();
            await tx
                .insert(db_1.lists)
                .values({ projectId: project.id, name: seed.list, createdById: userId });
            return workspace;
        });
    }
    async createPersonalWorkspace(userId, displayName) {
        const name = `${displayName.split(' ')[0] || 'My'}'s Workspace`;
        try {
            return await this.create(userId, { name });
        }
        catch (err) {
            if (err instanceof common_1.ConflictException) {
                return this.create(userId, { name, slug: slugify(`${name}-${userId.slice(0, 6)}`) });
            }
            throw err;
        }
    }
    async reserveUniqueSlug(base) {
        let candidate = base;
        let attempt = 0;
        while (await this.slugTaken(candidate)) {
            attempt += 1;
            if (attempt > 50) {
                throw new common_1.ConflictException('Could not allocate a unique workspace slug');
            }
            candidate = `${base}-${attempt}`;
        }
        return candidate;
    }
    async slugTaken(slug) {
        const [orgHit] = await this.db
            .select({ id: db_1.organizations.id })
            .from(db_1.organizations)
            .where((0, drizzle_orm_1.eq)(db_1.organizations.slug, slug))
            .limit(1);
        if (orgHit)
            return true;
        const [wsHit] = await this.db
            .select({ id: db_1.workspaces.id })
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.slug, slug))
            .limit(1);
        return Boolean(wsHit);
    }
    // --- Guided onboarding checklist (Plan §14.3) ------------------------------
    async count(query) {
        const [row] = await query;
        return row?.c ?? 0;
    }
    /**
     * Compute the onboarding checklist for a member of `workspaceId`: each step's
     * done-state is derived from real workspace data (counts of spaces, projects,
     * tasks, members and AI usage), and `dismissed` reflects the per-user flag
     * persisted on the notification-preferences jsonb. The widget hides once every
     * step is done OR the user has dismissed it.
     */
    async getOnboardingStatus(workspaceId, userId) {
        const cnt = (0, drizzle_orm_1.sql) `count(*)::int`;
        const spacesCount = await this.count(this.db.select({ c: cnt }).from(db_1.spaces).where((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)));
        const projectsCount = await this.count(this.db
            .select({ c: cnt })
            .from(db_1.projects)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)));
        const tasksCount = await this.count(this.db
            .select({ c: cnt })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)));
        const membersCount = await this.count(this.db
            .select({ c: cnt })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId)));
        const aiCount = await this.count(this.db.select({ c: cnt }).from(db_1.aiUsage).where((0, drizzle_orm_1.eq)(db_1.aiUsage.workspaceId, workspaceId)));
        const [userRow] = await this.db
            .select({ prefs: db_1.users.notificationPreferences })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .limit(1);
        const dismissed = userRow?.prefs?.onboarding
            ?.dismissed === true;
        const counts = {
            spaces: spacesCount,
            projects: projectsCount,
            tasks: tasksCount,
            members: membersCount,
            aiEvents: aiCount,
        };
        return { dismissed, counts, steps: computeOnboardingSteps(counts) };
    }
    /**
     * Persist the per-user "onboarding dismissed" flag. Uses a JSONB concat merge
     * so it only sets the `onboarding` key and never clobbers other notification
     * preferences — no migration, no new column.
     */
    async dismissOnboarding(userId) {
        await this.db
            .update(db_1.users)
            .set({
            notificationPreferences: (0, drizzle_orm_1.sql) `coalesce(${db_1.users.notificationPreferences}, '{}'::jsonb) || '{"onboarding":{"dismissed":true}}'::jsonb`,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId));
        return { dismissed: true };
    }
};
exports.WorkspacesService = WorkspacesService;
exports.WorkspacesService = WorkspacesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, security_service_1.SecurityService,
        webhooks_service_1.WebhooksService,
        r2_service_1.R2Service,
        plans_service_1.PlansService])
], WorkspacesService);
//# sourceMappingURL=workspaces.service.js.map