"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const workspaces_service_1 = require("./workspaces.service");
const workspaces_controller_1 = require("./workspaces.controller");
// §14.3 — onboarding checklist done-state is derived purely from real workspace
// counts, so each step auto-checks the moment the data proving it exists.
(0, node_test_1.describe)('computeOnboardingSteps (§14.3 onboarding done-state)', () => {
    (0, node_test_1.it)('all steps are incomplete for a brand-new workspace (only the creator, no data)', () => {
        const steps = (0, workspaces_service_1.computeOnboardingSteps)({ spaces: 0, projects: 0, tasks: 0, members: 1, aiEvents: 0 });
        strict_1.default.deepEqual(steps, { space: false, project: false, task: false, invite: false, ai: false });
    });
    (0, node_test_1.it)('marks each step done once its underlying object exists', () => {
        const steps = (0, workspaces_service_1.computeOnboardingSteps)({ spaces: 2, projects: 1, tasks: 5, members: 3, aiEvents: 4 });
        strict_1.default.deepEqual(steps, { space: true, project: true, task: true, invite: true, ai: true });
    });
    (0, node_test_1.it)('invite requires a SECOND member — the lone creator does not count', () => {
        strict_1.default.equal((0, workspaces_service_1.computeOnboardingSteps)({ spaces: 0, projects: 0, tasks: 0, members: 1, aiEvents: 0 }).invite, false);
        strict_1.default.equal((0, workspaces_service_1.computeOnboardingSteps)({ spaces: 0, projects: 0, tasks: 0, members: 2, aiEvents: 0 }).invite, true);
    });
    (0, node_test_1.it)('reports steps independently (partial progress)', () => {
        const steps = (0, workspaces_service_1.computeOnboardingSteps)({ spaces: 1, projects: 1, tasks: 0, members: 1, aiEvents: 0 });
        strict_1.default.deepEqual(steps, { space: true, project: true, task: false, invite: false, ai: false });
    });
});
(0, node_test_1.describe)('WorkspacesService.updateMemberRole role allowlist', () => {
    (0, node_test_1.it)('rejects assigning super_admin (privilege escalation guard)', async () => {
        const svc = new workspaces_service_1.WorkspacesService({}, {}, {}, {}, {});
        await strict_1.default.rejects(() => svc.updateMemberRole('ws', 'u', 'super_admin'), /Invalid role/);
    });
    (0, node_test_1.it)('rejects an unknown role', async () => {
        const svc = new workspaces_service_1.WorkspacesService({}, {}, {}, {}, {});
        await strict_1.default.rejects(() => svc.updateMemberRole('ws', 'u', 'root'), /Invalid role/);
    });
});
// §13.5 — the branding accent color persists through the workspace update, and
// the IP threaded from the controller reaches the audit event.
(0, node_test_1.describe)('WorkspacesService.update — accent color + audit IP (§13.3/§13.5)', () => {
    function buildDb() {
        let captured = null;
        const db = {
            update: () => ({
                set: (vals) => {
                    captured = vals;
                    return { where: () => ({ returning: async () => [{ id: 'ws-1', ...vals }] }) };
                },
            }),
        };
        return { db, captured: () => captured };
    }
    (0, node_test_1.it)('writes accent_color to the update set and records actor IP in the audit event', async () => {
        const { db, captured } = buildDb();
        const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
        const svc = new workspaces_service_1.WorkspacesService(db, security, {}, {}, {});
        const row = await svc.update('ws-1', { name: 'Acme', primaryColor: '#112233', accentColor: '#abcdef' }, { id: 'admin-1', email: 'admin@acme.test', ip: '203.0.113.9' });
        strict_1.default.equal(row.accentColor, '#abcdef');
        strict_1.default.equal(captured()?.accentColor, '#abcdef');
        const call = security.logAuditEvent.mock.calls[0].arguments[0];
        strict_1.default.equal(call.action, 'workspace.updated');
        strict_1.default.equal(call.ipAddress, '203.0.113.9');
        strict_1.default.equal(call.metadata.accentColor, '#abcdef');
    });
});
// §13.5 — logo upload presign mirrors the avatar flow: rejects non-images and
// oversized files, and returns an upload + public URL for valid images.
(0, node_test_1.describe)('WorkspacesService.createLogoUploadUrl (§13.5)', () => {
    const okR2 = {
        configured: true,
        presignPutObject: async () => 'https://r2.example/upload',
        getObjectUrl: async () => 'https://cdn.example/logo.png',
    };
    (0, node_test_1.it)('throws when storage is not configured', async () => {
        const svc = new workspaces_service_1.WorkspacesService({}, {}, {}, { configured: false }, {});
        await strict_1.default.rejects(() => svc.createLogoUploadUrl('ws', { contentType: 'image/png' }), /not configured/);
    });
    (0, node_test_1.it)('rejects a non-image content type', async () => {
        const svc = new workspaces_service_1.WorkspacesService({}, {}, {}, okR2, {});
        await strict_1.default.rejects(() => svc.createLogoUploadUrl('ws', { contentType: 'application/pdf' }), /image files/);
    });
    (0, node_test_1.it)('rejects an oversized image', async () => {
        const svc = new workspaces_service_1.WorkspacesService({}, {}, {}, okR2, {});
        await strict_1.default.rejects(() => svc.createLogoUploadUrl('ws', { contentType: 'image/png', sizeBytes: 99 * 1024 * 1024 }), /limit/);
    });
    (0, node_test_1.it)('returns upload + public URLs for a valid image', async () => {
        const svc = new workspaces_service_1.WorkspacesService({}, {}, {}, okR2, {});
        const res = await svc.createLogoUploadUrl('ws-7', { contentType: 'image/png', sizeBytes: 1024 });
        strict_1.default.equal(res.uploadUrl, 'https://r2.example/upload');
        strict_1.default.equal(res.publicUrl, 'https://cdn.example/logo.png');
        strict_1.default.match(res.storageKey, /^workspace-logos\/ws-7-[0-9a-f]+\.png$/);
    });
});
// §14.1 — addMember delegates the member-cap check to PlansService BEFORE inserting.
// A no-op for enterprise (unlimited); a hard 403 once a capped plan is full.
(0, node_test_1.describe)('WorkspacesService.addMember plan member-limit gate (§14.1)', () => {
    // db.select #1 -> the invited user; #2 -> getMembership (not yet a member).
    function buildDb() {
        let call = 0;
        return {
            select: () => ({
                from: () => ({
                    where: () => {
                        call += 1;
                        // 1st select: user lookup by email. 2nd: existing membership check.
                        return call === 1
                            ? Promise.resolve([{ id: 'u-1', email: 'a@b.c' }])
                            : Promise.resolve([]);
                    },
                }),
            }),
            insert: () => ({ values: () => Promise.resolve(undefined) }),
        };
    }
    (0, node_test_1.it)('blocks the add when PlansService says the plan is at its member cap', async () => {
        const plans = {
            assertCanAddMembers: node_test_1.mock.fn(async () => {
                throw new common_1.ForbiddenException('Your Free plan allows up to 5 members');
            }),
        };
        const svc = new workspaces_service_1.WorkspacesService(buildDb(), {}, {}, {}, plans);
        await strict_1.default.rejects(() => svc.addMember('ws-1', 'a@b.c'), /allows up to 5 members/);
        // Enforced against the right workspace, before any insert.
        strict_1.default.equal(plans.assertCanAddMembers.mock.callCount(), 1);
        strict_1.default.equal(plans.assertCanAddMembers.mock.calls[0].arguments[0], 'ws-1');
    });
});
// §13.5 — normalizeHost canonicalizes a Host so a custom-domain match is case-,
// port-, scheme-, and www-insensitive on BOTH the incoming host and the stored
// domain.
(0, node_test_1.describe)('normalizeHost (§13.5 custom-domain canonicalization)', () => {
    (0, node_test_1.it)('lowercases and strips a port', () => {
        strict_1.default.equal((0, workspaces_service_1.normalizeHost)('Example.COM:443'), 'example.com');
    });
    (0, node_test_1.it)('strips a single leading www.', () => {
        strict_1.default.equal((0, workspaces_service_1.normalizeHost)('www.example.com'), 'example.com');
    });
    (0, node_test_1.it)('strips scheme, path, and a trailing FQDN dot', () => {
        strict_1.default.equal((0, workspaces_service_1.normalizeHost)('https://www.Example.com.:8080/app'), 'example.com');
    });
    (0, node_test_1.it)('returns empty string for missing or blank input', () => {
        strict_1.default.equal((0, workspaces_service_1.normalizeHost)(''), '');
        strict_1.default.equal((0, workspaces_service_1.normalizeHost)(undefined), '');
        strict_1.default.equal((0, workspaces_service_1.normalizeHost)('   '), '');
    });
});
// §13.5 / §2.2 — resolveByCustomDomain turns a Host into the workspace that
// serves it, but ONLY when the domain is verified and the workspace is live, and
// returns a safe public projection (never members/tokens/plan limits/flags).
(0, node_test_1.describe)('WorkspacesService.resolveByCustomDomain (§13.5 Host -> workspace)', () => {
    // A condition-ignoring mock: it returns the seeded rows for any query, so the
    // service's own JS filtering (verified + not archived + normalized match) is
    // exactly what is under test.
    function svcWithRows(rows) {
        const db = { select: () => ({ from: () => ({ where: async () => rows }) }) };
        return new workspaces_service_1.WorkspacesService(db, {}, {}, {}, {});
    }
    const verified = {
        id: 'ws-1',
        name: 'Acme',
        slug: 'acme',
        logoUrl: 'https://cdn.example/logo.png',
        primaryColor: '#112233',
        accentColor: '#abcdef',
        customDomain: 'example.com',
        customDomainVerified: true,
        isArchived: false,
        // Sensitive / internal columns that must NEVER surface in the projection:
        customDomainToken: 'rundesk-verify=super-secret',
        planLimits: { maxMembers: 3 },
        organizationId: 'org-1',
    };
    (0, node_test_1.it)('matches a verified domain case/port/scheme/www-insensitively', async () => {
        for (const host of [
            'example.com',
            'EXAMPLE.com',
            'www.example.com',
            'Example.com:443',
            'https://www.example.com/',
        ]) {
            const res = await svcWithRows([verified]).resolveByCustomDomain(host);
            strict_1.default.equal(res?.id, 'ws-1', `host ${host} should resolve`);
        }
    });
    (0, node_test_1.it)('matches when the STORED domain carries www./caps but the host does not', async () => {
        const res = await svcWithRows([{ ...verified, customDomain: 'WWW.Example.com' }]).resolveByCustomDomain('example.com');
        strict_1.default.equal(res?.id, 'ws-1');
    });
    (0, node_test_1.it)('returns ONLY the safe public projection — no token/plan/org/flags', async () => {
        const res = await svcWithRows([verified]).resolveByCustomDomain('example.com');
        strict_1.default.deepEqual(Object.keys(res ?? {}).sort(), [
            'accentColor',
            'customDomain',
            'id',
            'logoUrl',
            'name',
            'primaryColor',
            'slug',
        ]);
        // Explicitly assert the sensitive fields did not leak through.
        strict_1.default.equal(res.customDomainToken, undefined);
        strict_1.default.equal(res.customDomainVerified, undefined);
        strict_1.default.equal(res.isArchived, undefined);
        strict_1.default.equal(res.planLimits, undefined);
        strict_1.default.equal(res.organizationId, undefined);
    });
    (0, node_test_1.it)('returns null for an unverified domain', async () => {
        strict_1.default.equal(await svcWithRows([{ ...verified, customDomainVerified: false }]).resolveByCustomDomain('example.com'), null);
    });
    (0, node_test_1.it)('returns null for an archived workspace', async () => {
        strict_1.default.equal(await svcWithRows([{ ...verified, isArchived: true }]).resolveByCustomDomain('example.com'), null);
    });
    (0, node_test_1.it)('returns null for an unknown host', async () => {
        strict_1.default.equal(await svcWithRows([verified]).resolveByCustomDomain('other.example'), null);
    });
    (0, node_test_1.it)('returns null for a blank host without querying the DB', async () => {
        let selected = false;
        const db = {
            select: () => {
                selected = true;
                return { from: () => ({ where: async () => [] }) };
            },
        };
        const svc = new workspaces_service_1.WorkspacesService(db, {}, {}, {}, {});
        strict_1.default.equal(await svc.resolveByCustomDomain(''), null);
        strict_1.default.equal(selected, false);
    });
});
// §13.5 / §2.2 — isCustomDomainAuthorized is the on-demand-TLS authorization
// decision. It is a thin boolean over resolveByCustomDomain, so the "issue a
// certificate?" answer can never diverge from "does the app serve this host?":
// true only for a VERIFIED, non-archived custom domain; false for everything
// else. False for arbitrary hosts is what stops a proxy from being steered into
// requesting ACME certificates for domains an attacker does not control.
(0, node_test_1.describe)('WorkspacesService.isCustomDomainAuthorized (§13.5 on-demand TLS ask)', () => {
    function svcWithRows(rows) {
        const db = { select: () => ({ from: () => ({ where: async () => rows }) }) };
        return new workspaces_service_1.WorkspacesService(db, {}, {}, {}, {});
    }
    const verified = {
        id: 'ws-1',
        name: 'Acme',
        slug: 'acme',
        logoUrl: null,
        primaryColor: null,
        accentColor: null,
        customDomain: 'example.com',
        customDomainVerified: true,
        isArchived: false,
    };
    (0, node_test_1.it)('authorizes a verified, live custom domain (case/port/scheme/www-insensitive)', async () => {
        for (const host of ['example.com', 'EXAMPLE.com', 'www.example.com', 'Example.com:443', 'https://www.example.com/']) {
            strict_1.default.equal(await svcWithRows([verified]).isCustomDomainAuthorized(host), true, `host ${host}`);
        }
    });
    (0, node_test_1.it)('refuses an unverified domain', async () => {
        strict_1.default.equal(await svcWithRows([{ ...verified, customDomainVerified: false }]).isCustomDomainAuthorized('example.com'), false);
    });
    (0, node_test_1.it)('refuses an archived workspace', async () => {
        strict_1.default.equal(await svcWithRows([{ ...verified, isArchived: true }]).isCustomDomainAuthorized('example.com'), false);
    });
    (0, node_test_1.it)('refuses an unknown/arbitrary host', async () => {
        strict_1.default.equal(await svcWithRows([verified]).isCustomDomainAuthorized('attacker.example'), false);
    });
    (0, node_test_1.it)('refuses a blank host', async () => {
        strict_1.default.equal(await svcWithRows([verified]).isCustomDomainAuthorized(''), false);
    });
});
// §13.5 / §2.2 — the public GET /public/tls/authorize endpoint is the HTTP "ask"
// a TLS-terminating proxy (e.g. Caddy on_demand_tls) calls: a 2xx means "issue a
// cert for this host", a non-2xx (403 ForbiddenException) means "do not".
// Exercised end-to-end (controller -> service -> normalizeHost /
// resolveByCustomDomain) so the 200-vs-403 contract is genuinely under test.
(0, node_test_1.describe)('WorkspacesPublicController.authorizeTls (§13.5 on-demand TLS ask)', () => {
    function controllerWithRows(rows) {
        const db = { select: () => ({ from: () => ({ where: async () => rows }) }) };
        const svc = new workspaces_service_1.WorkspacesService(db, {}, {}, {}, {});
        return new workspaces_controller_1.WorkspacesPublicController(svc);
    }
    const verified = {
        id: 'ws-1',
        name: 'Acme',
        slug: 'acme',
        logoUrl: null,
        primaryColor: null,
        accentColor: null,
        customDomain: 'example.com',
        customDomainVerified: true,
        isArchived: false,
    };
    (0, node_test_1.it)('returns { ok: true } (HTTP 200) for a verified custom domain via ?domain=', async () => {
        strict_1.default.deepEqual(await controllerWithRows([verified]).authorizeTls('example.com'), { ok: true });
    });
    (0, node_test_1.it)('authorizes case/port-insensitively, exactly like the resolver', async () => {
        strict_1.default.deepEqual(await controllerWithRows([verified]).authorizeTls('EXAMPLE.com:443'), { ok: true });
    });
    (0, node_test_1.it)('accepts ?host= as an alias, then the Host header as a last resort', async () => {
        strict_1.default.deepEqual(await controllerWithRows([verified]).authorizeTls(undefined, 'example.com'), { ok: true });
        strict_1.default.deepEqual(await controllerWithRows([verified]).authorizeTls(undefined, undefined, 'example.com'), { ok: true });
    });
    (0, node_test_1.it)('?domain= takes precedence over ?host= and the Host header', async () => {
        // A matching ?domain= authorizes even when the other sources would not…
        strict_1.default.deepEqual(await controllerWithRows([verified]).authorizeTls('example.com', 'nope.example', 'nope.example'), { ok: true });
        // …and a non-matching ?domain= refuses even when the Host header would match.
        await strict_1.default.rejects(() => controllerWithRows([verified]).authorizeTls('nope.example', undefined, 'example.com'), common_1.ForbiddenException);
    });
    (0, node_test_1.it)('throws ForbiddenException (non-2xx) for an unverified domain', async () => {
        await strict_1.default.rejects(() => controllerWithRows([{ ...verified, customDomainVerified: false }]).authorizeTls('example.com'), common_1.ForbiddenException);
    });
    (0, node_test_1.it)('throws ForbiddenException (non-2xx) for an archived workspace', async () => {
        await strict_1.default.rejects(() => controllerWithRows([{ ...verified, isArchived: true }]).authorizeTls('example.com'), common_1.ForbiddenException);
    });
    (0, node_test_1.it)('throws ForbiddenException (non-2xx) for an unknown/arbitrary host', async () => {
        await strict_1.default.rejects(() => controllerWithRows([verified]).authorizeTls('attacker.example'), common_1.ForbiddenException);
    });
    (0, node_test_1.it)('throws ForbiddenException (non-2xx) when no host is supplied at all', async () => {
        await strict_1.default.rejects(() => controllerWithRows([verified]).authorizeTls(), common_1.ForbiddenException);
    });
});
// §A4.10 — the schedule drives Workload's capacity, so a day that quietly
// vanishes shows up much later as numbers nobody can explain. These reject
// before touching the database, so a bare service instance is enough.
(0, node_test_1.describe)('WorkspacesService.setWorkDays validation', () => {
    const svc = () => new workspaces_service_1.WorkspacesService({}, {}, {}, {}, {});
    (0, node_test_1.it)('refuses a non-array', async () => {
        await strict_1.default.rejects(() => svc().setWorkDays('ws', 'mon,tue'), /must be an array/);
    });
    (0, node_test_1.it)('refuses day 0 — JavaScript calls Sunday 0, ISO calls it 7', async () => {
        await strict_1.default.rejects(() => svc().setWorkDays('ws', [0, 1, 2]), /ISO weekdays 1–7/);
    });
    (0, node_test_1.it)('refuses a day past Sunday', async () => {
        await strict_1.default.rejects(() => svc().setWorkDays('ws', [1, 2, 8]), /ISO weekdays 1–7/);
    });
    (0, node_test_1.it)('refuses a non-numeric day rather than coercing it to NaN and dropping it', async () => {
        await strict_1.default.rejects(() => svc().setWorkDays('ws', ['x']), /ISO weekdays 1–7/);
    });
    (0, node_test_1.it)('names the offending days, so the caller can see which one it was', async () => {
        await strict_1.default.rejects(() => svc().setWorkDays('ws', [1, 9, 0]), /9, 0/);
    });
    (0, node_test_1.it)('refuses a week with no working days at all', async () => {
        await strict_1.default.rejects(() => svc().setWorkDays('ws', []), /at least one working day/);
    });
    // A repeat is the same set, so it is normalised rather than rejected. The
    // update itself needs a db, so getting past validation is the assertion.
    (0, node_test_1.it)('accepts a repeated day and does not reject it as malformed', async () => {
        await strict_1.default.rejects(() => svc().setWorkDays('ws', [5, 1, 2, 3, 4, 1]), (err) => !/ISO weekdays|at least one/.test(err.message), 'a repeated day should normalise, not fail validation');
    });
});
//# sourceMappingURL=workspaces.service.test.js.map