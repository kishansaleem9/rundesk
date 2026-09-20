import { WorkspacesService } from './workspaces.service';
import { PlansService } from '../plans/plans.service';
import type { PlanLimitsOverride } from '../plans/plans.constants';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
export declare class WorkspacesController {
    private readonly workspacesService;
    private readonly plans;
    constructor(workspacesService: WorkspacesService, plans: PlansService);
    getMyWorkspaces(user: any): Promise<{
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
    getArchivedWorkspaces(user: any): Promise<{
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
    create(user: any, dto: CreateWorkspaceDto): Promise<{
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
    getOne(workspaceId: string): Promise<{
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
    getPlan(workspaceId: string): Promise<import("../plans/plans.service").PlanUsage>;
    setPlan(workspaceId: string, body: {
        plan: string;
        planLimits?: PlanLimitsOverride | null;
    }, user: any): Promise<import("../plans/plans.service").PlanUsage>;
    update(workspaceId: string, body: {
        name?: string;
        logoUrl?: string | null;
        primaryColor?: string | null;
        accentColor?: string | null;
        customDomain?: string | null;
        defaultSpacePrivate?: boolean;
        blockPublicSharing?: boolean;
    }, user: any, ip: string): Promise<{
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
    presignLogo(workspaceId: string, body: {
        contentType: string;
        sizeBytes?: number;
    }): Promise<{
        uploadUrl: string;
        publicUrl: string;
        storageKey: string;
    }>;
    getArchivedTasks(workspaceId: string, user: any): Promise<{
        id: string;
        title: string;
        listId: string;
        listName: string;
        projectName: string;
        updatedAt: Date;
    }[]>;
    verifyDomain(workspaceId: string): Promise<{
        verified: boolean;
        host: string;
        expectedTxt: string;
    }>;
    archive(workspaceId: string, user: any, ip: string): Promise<{
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
    restore(workspaceId: string, user: any): Promise<{
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
    getOnboarding(workspaceId: string, user: any): Promise<{
        dismissed: boolean;
        counts: import("./workspaces.service").OnboardingCounts;
        steps: import("./workspaces.service").OnboardingSteps;
    }>;
    dismissOnboarding(_workspaceId: string, user: any): Promise<{
        dismissed: boolean;
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
    addMember(workspaceId: string, body: {
        email: string;
        role?: string;
    }, user: any): Promise<{
        ok: boolean;
        userId: string;
    }>;
    updateMember(workspaceId: string, userId: string, body: {
        role: string;
    }, user: any, ip: string): Promise<{
        ok: boolean;
    }>;
    updateMemberCapacity(workspaceId: string, userId: string, body: {
        weeklyCapacityHours: number;
    }, user: any): Promise<{
        ok: boolean;
        weeklyCapacityHours: number;
    }>;
    updateMemberManager(workspaceId: string, userId: string, body: {
        managerId: string | null;
    }, user: any, ip: string): Promise<{
        ok: boolean;
        managerId: string | null;
    }>;
    getWorkSchedule(workspaceId: string): Promise<{
        workDays: number[];
        holidays: {
            id: string;
            day: string;
            name: string;
        }[];
    }>;
    setWorkDays(workspaceId: string, body: {
        workDays: number[];
    }, user: any, ip: string): Promise<{
        ok: boolean;
        workDays: number[];
    }>;
    addHoliday(workspaceId: string, body: {
        day: string;
        name: string;
    }, user: any, ip: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        workspaceId: string;
        day: string;
    }>;
    removeHoliday(workspaceId: string, holidayId: string, user: any, ip: string): Promise<{
        ok: boolean;
    }>;
    removeMember(workspaceId: string, userId: string, user: any, ip: string): Promise<{
        ok: boolean;
    }>;
}
/**
 * Public, unauthenticated custom-domain resolution (Plan §13.5 / §2.2). No
 * JwtAuthGuard — mirrors ClientPortalPublicController / DocsPublicController — so
 * the SPA can, at bootstrap on a custom domain, discover which workspace the
 * domain belongs to and apply its branding before anyone signs in. GET is a
 * safe method, so the global CsrfGuard admits it too. Returns only the safe
 * public branding projection, or 404 when no verified workspace claims the host.
 *
 * It also hosts the on-demand-TLS authorization ("ask") endpoint a
 * TLS-terminating reverse proxy calls to decide whether to obtain a certificate
 * for an incoming Host — see `authorizeTls` for the operational contract.
 */
export declare class WorkspacesPublicController {
    private readonly workspacesService;
    constructor(workspacesService: WorkspacesService);
    workspaceByDomain(hostParam?: string, hostHeader?: string): Promise<import("./workspaces.service").PublicWorkspaceBranding>;
    /**
     * On-demand TLS authorization ("ask") endpoint for a TLS-terminating reverse
     * proxy (Plan §13.5 / §2.2). This closes the custom-domain TLS caveat at the
     * app layer: certificate provisioning used to be noted as a manual ops step,
     * but the app now OWNS the authorization decision (which hosts may get a
     * certificate) while the proxy owns ACME + certificate storage.
     *
     * OPERATIONAL CONTRACT — point the proxy's on-demand-TLS "ask" at:
     *
     *     GET /api/v1/public/tls/authorize?domain={host}
     *
     * It returns HTTP 200 (`{ ok: true }`) IF AND ONLY IF {host} is the VERIFIED
     * custom domain of a live (non-archived) workspace, and HTTP 403 otherwise. A
     * TLS-terminating proxy (e.g. Caddy `on_demand_tls` with `ask`, or any proxy
     * exposing an on-demand-TLS authorization hook) treats a 2xx as "yes, obtain /
     * renew a certificate for this host" and any non-2xx as "no". Wiring this in
     * makes custom-domain HTTPS FULLY AUTOMATIC in production — the proxy obtains
     * and renews certificates on demand ONLY for domains a workspace owner has
     * verified (via the DNS-TXT `verifyCustomDomain` flow), with NO per-domain
     * manual certificate step — and it refuses every other host, which prevents an
     * attacker from steering the proxy into requesting ACME certificates for
     * arbitrary domains it does not control.
     *
     * Example Caddyfile:
     *
     *     {
     *       on_demand_tls {
     *         ask http://rundesk-api:3001/api/v1/public/tls/authorize
     *       }
     *     }
     *     https:// {
     *       tls { on_demand }
     *       reverse_proxy rundesk-api:3001
     *     }
     *
     * Caddy appends `?domain=<sni-host>` to the ask URL automatically. The
     * decision reuses `resolveByCustomDomain`, so it can never diverge from which
     * host the app actually serves, and is a single cheap lookup over the small
     * set of workspaces that set a custom domain. Because that decision keys on
     * the `?domain=` query value, a short `Cache-Control` hint lets the proxy/edge
     * skip re-asking for the same host on every handshake without meaningfully
     * delaying propagation when a domain is later unverified or archived. The
     * header is only emitted on the 200 path, so a refusal is never cached.
     */
    authorizeTls(domainParam?: string, hostParam?: string, hostHeader?: string): Promise<{
        ok: boolean;
    }>;
}
