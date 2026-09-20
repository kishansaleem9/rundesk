import type { Db } from '@rundesk/db';
import { R2Service } from '../../common/storage/r2.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { SecurityService } from '../security/security.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PlansService } from '../plans/plans.service';
/** Actor context threaded into audit events. `ip` is captured best-effort. */
type AuditActor = {
    id: string;
    email?: string;
    ip?: string;
};
/** Hard cap on an uploaded workspace logo. */
export declare const MAX_LOGO_BYTES: number;
/**
 * Guided-onboarding checklist (Plan §14.3). Raw counts of the workspace's core
 * objects, plus whether the AI assistant has been used and how many members it
 * has. Each is cheap to compute and drives a checklist step's "done" state.
 */
export type OnboardingCounts = {
    spaces: number;
    projects: number;
    tasks: number;
    members: number;
    aiEvents: number;
};
/** Per-step done-state for the onboarding checklist. Verifiable from real data. */
export type OnboardingSteps = {
    /** ≥1 space created. */
    space: boolean;
    /** ≥1 project created (in any space). */
    project: boolean;
    /** ≥1 task created (in any list). */
    task: boolean;
    /** ≥2 workspace members — i.e. at least one teammate beyond the creator. */
    invite: boolean;
    /** The AI assistant has been used at least once in this workspace. */
    ai: boolean;
};
/**
 * Pure done-state computation for the onboarding checklist — kept side-effect
 * free so it is unit-testable without a database. A step is "done" the moment
 * the workspace has real data proving it, so steps auto-check as the user works.
 */
export declare function computeOnboardingSteps(counts: OnboardingCounts): OnboardingSteps;
/**
 * A workspace's SAFE, PUBLIC branding projection (Plan §13.5). Exactly the
 * fields a custom-domain visitor needs to render the branded entry point —
 * never members, the DNS verification token, plan limits, or any other
 * internal/secret column.
 */
export type PublicWorkspaceBranding = {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    customDomain: string | null;
};
/**
 * Normalize an HTTP `Host` (or a stored custom domain) to a canonical
 * comparison key: trimmed, lowercased, scheme/path stripped, port stripped,
 * trailing FQDN dot removed, and a single leading `www.` removed. Applied to
 * BOTH sides of a custom-domain match so "Example.com:443", "www.example.com"
 * and "example.com" all resolve to the same workspace — and so it does not
 * matter whether the owner saved the bare or the `www.` form. Returns '' when
 * there is nothing usable to match on.
 */
export declare function normalizeHost(host: string | null | undefined): string;
export declare class WorkspacesService {
    private db;
    private readonly security;
    private readonly webhooks;
    private readonly r2;
    private readonly plans;
    constructor(db: Db, security: SecurityService, webhooks: WebhooksService, r2: R2Service, plans: PlansService);
    /**
     * Best-effort webhook fan-out (Plan §12.4). Mirrors the webhooks portion of
     * TasksService.fireTaskEvent — non-blocking, failures logged not thrown, so
     * a downed webhook can never break a membership mutation.
     */
    private fireWebhook;
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
    findByMember(userId: string): Promise<{
        workspace: {
            id: string;
            organizationId: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            primaryColor: string | null;
            purpose: string | null;
            comingFrom: string | null;
            accentColor: string | null;
            customDomain: string | null;
            customDomainToken: string | null;
            customDomainVerified: boolean;
            isArchived: boolean;
            plan: string;
            planLimits: {
                maxMembers?: number | null;
                maxProjects?: number | null;
                features?: Record<string, boolean>;
            } | null;
            defaultSpacePrivate: boolean;
            blockPublicSharing: boolean;
            workDays: number[];
            aiMinutesSavedPerRun: number;
            aiHourlyRateCents: number;
            createdAt: Date;
            updatedAt: Date;
        };
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
    }[]>;
    /** Soft-delete (archive) a workspace so it disappears from members' lists. */
    archiveWorkspace(workspaceId: string, actor?: AuditActor): Promise<{
        id: string;
        organizationId: string;
        name: string;
        slug: string;
        logoUrl: string | null;
        primaryColor: string | null;
        purpose: string | null;
        comingFrom: string | null;
        accentColor: string | null;
        customDomain: string | null;
        customDomainToken: string | null;
        customDomainVerified: boolean;
        isArchived: boolean;
        plan: string;
        planLimits: {
            maxMembers?: number | null;
            maxProjects?: number | null;
            features?: Record<string, boolean>;
        } | null;
        defaultSpacePrivate: boolean;
        blockPublicSharing: boolean;
        workDays: number[];
        aiMinutesSavedPerRun: number;
        aiHourlyRateCents: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    restoreWorkspace(workspaceId: string, actor?: AuditActor): Promise<{
        id: string;
        organizationId: string;
        name: string;
        slug: string;
        logoUrl: string | null;
        primaryColor: string | null;
        purpose: string | null;
        comingFrom: string | null;
        accentColor: string | null;
        customDomain: string | null;
        customDomainToken: string | null;
        customDomainVerified: boolean;
        isArchived: boolean;
        plan: string;
        planLimits: {
            maxMembers?: number | null;
            maxProjects?: number | null;
            features?: Record<string, boolean>;
        } | null;
        defaultSpacePrivate: boolean;
        blockPublicSharing: boolean;
        workDays: number[];
        aiMinutesSavedPerRun: number;
        aiHourlyRateCents: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Archived workspaces the user still belongs to (Plan §13.4). The regular
     * `/workspaces` list hides these; the settings "Archived" area surfaces them
     * so an admin can restore one. Restore itself is admin-guarded.
     */
    listArchivedWorkspaces(userId: string): Promise<{
        workspace: {
            id: string;
            organizationId: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            primaryColor: string | null;
            purpose: string | null;
            comingFrom: string | null;
            accentColor: string | null;
            customDomain: string | null;
            customDomainToken: string | null;
            customDomainVerified: boolean;
            isArchived: boolean;
            plan: string;
            planLimits: {
                maxMembers?: number | null;
                maxProjects?: number | null;
                features?: Record<string, boolean>;
            } | null;
            defaultSpacePrivate: boolean;
            blockPublicSharing: boolean;
            workDays: number[];
            aiMinutesSavedPerRun: number;
            aiHourlyRateCents: number;
            createdAt: Date;
            updatedAt: Date;
        };
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
    }[]>;
    /**
     * Archived (soft-deleted) tasks across a workspace (Plan §13.4). Joined up the
     * task → list → project → space tree so we can scope by workspace and show the
     * list/project a task belongs to. Restore uses the existing task-restore route.
     */
    listArchivedTasks(workspaceId: string, actor?: {
        id: string;
        role?: string;
    }): Promise<{
        id: string;
        title: string;
        listId: string;
        listName: string;
        projectName: string;
        updatedAt: Date;
    }[]>;
    /**
     * Presign a direct-to-R2 PUT for a workspace logo (Plan §13.5). Mirrors the
     * avatar/clip presign flow: validate image type + size, return a short-lived
     * upload URL plus the public URL the client persists via PATCH /workspaces/:id
     * (logoUrl). Keys live under `workspace-logos/<workspaceId>-<rand>.<ext>`.
     */
    createLogoUploadUrl(workspaceId: string, body: {
        contentType: string;
        sizeBytes?: number;
    }): Promise<{
        uploadUrl: string;
        publicUrl: string;
        storageKey: string;
    }>;
    findById(id: string): Promise<{
        id: string;
        organizationId: string;
        name: string;
        slug: string;
        logoUrl: string | null;
        primaryColor: string | null;
        purpose: string | null;
        comingFrom: string | null;
        accentColor: string | null;
        customDomain: string | null;
        customDomainToken: string | null;
        customDomainVerified: boolean;
        isArchived: boolean;
        plan: string;
        planLimits: {
            maxMembers?: number | null;
            maxProjects?: number | null;
            features?: Record<string, boolean>;
        } | null;
        defaultSpacePrivate: boolean;
        blockPublicSharing: boolean;
        workDays: number[];
        aiMinutesSavedPerRun: number;
        aiHourlyRateCents: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getMembership(workspaceId: string, userId: string): Promise<{
        id: string;
        workspaceId: string;
        userId: string;
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        weeklyCapacityHours: number;
        managerId: string | null;
        joinedAt: Date;
    }>;
    update(workspaceId: string, patch: {
        name?: string;
        logoUrl?: string | null;
        primaryColor?: string | null;
        accentColor?: string | null;
        customDomain?: string | null;
        defaultSpacePrivate?: boolean;
        blockPublicSharing?: boolean;
    }, actor?: AuditActor): Promise<{
        id: string;
        organizationId: string;
        name: string;
        slug: string;
        logoUrl: string | null;
        primaryColor: string | null;
        purpose: string | null;
        comingFrom: string | null;
        accentColor: string | null;
        customDomain: string | null;
        customDomainToken: string | null;
        customDomainVerified: boolean;
        isArchived: boolean;
        plan: string;
        planLimits: {
            maxMembers?: number | null;
            maxProjects?: number | null;
            features?: Record<string, boolean>;
        } | null;
        defaultSpacePrivate: boolean;
        blockPublicSharing: boolean;
        workDays: number[];
        aiMinutesSavedPerRun: number;
        aiHourlyRateCents: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Verify a workspace's custom domain by looking for the verification token in
     * a TXT record at _rundesk-verify.<domain> (Plan §13).
     */
    verifyCustomDomain(workspaceId: string): Promise<{
        verified: boolean;
        host: string;
        expectedTxt: string;
    }>;
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
    resolveByCustomDomain(host: string): Promise<PublicWorkspaceBranding | null>;
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
    isCustomDomainAuthorized(host: string): Promise<boolean>;
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
    getWorkSchedule(workspaceId: string): Promise<{
        workDays: number[];
        holidays: {
            id: string;
            day: string;
            name: string;
        }[];
    }>;
    setWorkDays(workspaceId: string, days: unknown, actor?: AuditActor): Promise<{
        ok: boolean;
        workDays: number[];
    }>;
    addHoliday(workspaceId: string, day: string, name: string, actor?: AuditActor): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        workspaceId: string;
        day: string;
    }>;
    removeHoliday(workspaceId: string, holidayId: string, actor?: AuditActor): Promise<{
        ok: boolean;
    }>;
    listMembers(workspaceId: string): Promise<{
        managerName: string | null;
        invitedAt: Date | null;
        invitedByName: string | null;
        invitedByEmail: string | null;
        teams: string[];
        userId: string;
        workspaceMemberId: string;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        weeklyCapacityHours: number;
        managerId: string | null;
        joinedAt: Date;
        lastSeenAt: Date | null;
        timezone: string;
        statusEmoji: string | null;
        statusText: string | null;
        statusExpiresAt: Date | null;
    }[]>;
    /**
     * Set (or clear) who a member reports to.
     *
     * Two things must not happen: a person reporting to themselves, and a cycle —
     * A→B→A leaves the roster tree with a set of people who have a manager but no
     * root, so they vanish from the chart entirely. Both are rejected here rather
     * than papered over when rendering.
     */
    updateMemberManager(workspaceId: string, userId: string, managerId: string | null, actor?: AuditActor): Promise<{
        ok: boolean;
        managerId: string | null;
    }>;
    addMember(workspaceId: string, email: string, role?: string, actor?: AuditActor): Promise<{
        ok: boolean;
        userId: string;
    }>;
    updateMemberRole(workspaceId: string, userId: string, role: string, actor?: AuditActor): Promise<{
        ok: boolean;
    }>;
    updateMemberCapacity(workspaceId: string, userId: string, weeklyCapacityHours: number, actor?: AuditActor): Promise<{
        ok: boolean;
        weeklyCapacityHours: number;
    }>;
    removeMember(workspaceId: string, userId: string, actor?: AuditActor): Promise<{
        ok: boolean;
    }>;
    create(userId: string, dto: CreateWorkspaceDto & {
        organizationId?: string;
        /** §7 — what the creation flow asked. */
        purpose?: string | null;
        comingFrom?: string | null;
    }): Promise<{
        id: string;
        name: string;
        slug: string;
        logoUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        primaryColor: string | null;
        purpose: string | null;
        comingFrom: string | null;
        accentColor: string | null;
        customDomain: string | null;
        customDomainToken: string | null;
        customDomainVerified: boolean;
        isArchived: boolean;
        plan: string;
        planLimits: {
            maxMembers?: number | null;
            maxProjects?: number | null;
            features?: Record<string, boolean>;
        } | null;
        defaultSpacePrivate: boolean;
        blockPublicSharing: boolean;
        workDays: number[];
        aiMinutesSavedPerRun: number;
        aiHourlyRateCents: number;
    }>;
    createPersonalWorkspace(userId: string, displayName: string): Promise<{
        id: string;
        name: string;
        slug: string;
        logoUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        primaryColor: string | null;
        purpose: string | null;
        comingFrom: string | null;
        accentColor: string | null;
        customDomain: string | null;
        customDomainToken: string | null;
        customDomainVerified: boolean;
        isArchived: boolean;
        plan: string;
        planLimits: {
            maxMembers?: number | null;
            maxProjects?: number | null;
            features?: Record<string, boolean>;
        } | null;
        defaultSpacePrivate: boolean;
        blockPublicSharing: boolean;
        workDays: number[];
        aiMinutesSavedPerRun: number;
        aiHourlyRateCents: number;
    }>;
    private reserveUniqueSlug;
    private slugTaken;
    private count;
    /**
     * Compute the onboarding checklist for a member of `workspaceId`: each step's
     * done-state is derived from real workspace data (counts of spaces, projects,
     * tasks, members and AI usage), and `dismissed` reflects the per-user flag
     * persisted on the notification-preferences jsonb. The widget hides once every
     * step is done OR the user has dismissed it.
     */
    getOnboardingStatus(workspaceId: string, userId: string): Promise<{
        dismissed: boolean;
        counts: OnboardingCounts;
        steps: OnboardingSteps;
    }>;
    /**
     * Persist the per-user "onboarding dismissed" flag. Uses a JSONB concat merge
     * so it only sets the `onboarding` key and never clobbers other notification
     * preferences — no migration, no new column.
     */
    dismissOnboarding(userId: string): Promise<{
        dismissed: boolean;
    }>;
}
export {};
