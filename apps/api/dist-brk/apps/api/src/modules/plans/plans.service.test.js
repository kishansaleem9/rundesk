"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const db_1 = require("@rundesk/db");
const plans_service_1 = require("./plans.service");
/**
 * A drizzle-shaped mock DB that resolves each select by the table passed to
 * `.from()` — robust against call ordering. `plan`/`members`/`projects` seed the
 * three read paths PlansService uses.
 */
function makeDb(opts = {}) {
    const db = {
        select: () => {
            const chain = { _table: null };
            chain.from = (t) => {
                chain._table = t;
                return chain;
            };
            chain.innerJoin = () => chain;
            chain.where = () => chain;
            chain.limit = () => chain;
            chain.orderBy = () => chain;
            chain.then = (resolve) => {
                if (chain._table === db_1.workspaces)
                    return resolve([{ plan: opts.plan ?? 'enterprise', planLimits: opts.planLimits ?? null }]);
                if (chain._table === db_1.workspaceMembers)
                    return resolve([{ c: opts.members ?? 0 }]);
                if (chain._table === db_1.projects)
                    return resolve([{ c: opts.projects ?? 0 }]);
                return resolve([]);
            };
            return chain;
        },
        update: () => ({
            set: () => ({ where: () => ({ returning: async () => opts.updateReturning ?? [{ id: 'ws-1' }] }) }),
        }),
    };
    return db;
}
(0, node_test_1.describe)('PlansService.assertFeature (AI gate)', () => {
    (0, node_test_1.it)('enterprise passes the AI gate (no regression)', async () => {
        const svc = new plans_service_1.PlansService(makeDb({ plan: 'enterprise' }));
        await svc.assertFeature('ws', 'ai'); // resolves
    });
    (0, node_test_1.it)('free plan is denied AI with a 403', async () => {
        const svc = new plans_service_1.PlansService(makeDb({ plan: 'free' }));
        await strict_1.default.rejects(() => svc.assertFeature('ws', 'ai'), common_1.ForbiddenException);
    });
    (0, node_test_1.it)('hasFeature reflects the tier', async () => {
        strict_1.default.equal(await new plans_service_1.PlansService(makeDb({ plan: 'enterprise' })).hasFeature('ws', 'ai'), true);
        strict_1.default.equal(await new plans_service_1.PlansService(makeDb({ plan: 'free' })).hasFeature('ws', 'ai'), false);
    });
});
(0, node_test_1.describe)('PlansService.assertCanAddMembers (member limit on invite)', () => {
    (0, node_test_1.it)('enterprise never runs the count (unlimited) — always allowed', async () => {
        // members intentionally huge; unlimited plan must still pass.
        const svc = new plans_service_1.PlansService(makeDb({ plan: 'enterprise', members: 9999 }));
        await svc.assertCanAddMembers('ws');
    });
    (0, node_test_1.it)('free plan allows adding up to the cap', async () => {
        // 4 members, cap 5, adding 1 => 5 <= 5 OK.
        const svc = new plans_service_1.PlansService(makeDb({ plan: 'free', members: 4 }));
        await svc.assertCanAddMembers('ws');
    });
    (0, node_test_1.it)('free plan blocks the member that would exceed the cap', async () => {
        // 5 members, cap 5, adding 1 => 6 > 5 => 403.
        const svc = new plans_service_1.PlansService(makeDb({ plan: 'free', members: 5 }));
        await strict_1.default.rejects(() => svc.assertCanAddMembers('ws'), common_1.ForbiddenException);
    });
});
(0, node_test_1.describe)('PlansService.assertCanCreateProjects (project limit on create)', () => {
    (0, node_test_1.it)('enterprise is unlimited', async () => {
        const svc = new plans_service_1.PlansService(makeDb({ plan: 'enterprise', projects: 9999 }));
        await svc.assertCanCreateProjects('ws');
    });
    (0, node_test_1.it)('free plan blocks the project beyond the cap of 3', async () => {
        const svc = new plans_service_1.PlansService(makeDb({ plan: 'free', projects: 3 }));
        await strict_1.default.rejects(() => svc.assertCanCreateProjects('ws'), common_1.ForbiddenException);
    });
});
(0, node_test_1.describe)('PlansService.getUsage (plan card payload)', () => {
    (0, node_test_1.it)('returns plan id, limits, features and live usage counts', async () => {
        const svc = new plans_service_1.PlansService(makeDb({ plan: 'free', members: 2, projects: 1 }));
        const usage = await svc.getUsage('ws');
        strict_1.default.equal(usage.plan, 'free');
        strict_1.default.equal(usage.limits.maxMembers, 5);
        strict_1.default.equal(usage.limits.maxProjects, 3);
        strict_1.default.equal(usage.features.ai, false);
        strict_1.default.deepEqual(usage.usage, { members: 2, projects: 1 });
        strict_1.default.equal(usage.catalog.length, 4);
    });
    (0, node_test_1.it)('enterprise usage reports unlimited limits (null)', async () => {
        const svc = new plans_service_1.PlansService(makeDb({ plan: 'enterprise', members: 12, projects: 40 }));
        const usage = await svc.getUsage('ws');
        strict_1.default.equal(usage.plan, 'enterprise');
        strict_1.default.equal(usage.limits.maxMembers, null);
        strict_1.default.equal(usage.features.ai, true);
        strict_1.default.deepEqual(usage.usage, { members: 12, projects: 40 });
    });
});
(0, node_test_1.describe)('PlansService.setWorkspacePlan (super-admin action)', () => {
    (0, node_test_1.it)('rejects an unknown plan id', async () => {
        const svc = new plans_service_1.PlansService(makeDb());
        await strict_1.default.rejects(() => svc.setWorkspacePlan('ws', 'platinum'), common_1.BadRequestException);
    });
    (0, node_test_1.it)('accepts a valid plan id and returns the fresh usage snapshot', async () => {
        // After the update, getUsage reads the (mocked) workspace as 'free'.
        const svc = new plans_service_1.PlansService(makeDb({ plan: 'free', members: 0, projects: 0 }));
        const usage = await svc.setWorkspacePlan('ws', 'free');
        strict_1.default.equal(usage.plan, 'free');
    });
});
//# sourceMappingURL=plans.service.test.js.map