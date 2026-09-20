"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const workspace_creation_policy_1 = require("./workspace-creation-policy");
/** Walk up to the workspace root: this compiles to CJS, so no import.meta. */
function workspaceRoot(from) {
    let dir = from;
    for (;;) {
        if ((0, node_fs_1.existsSync)((0, node_path_1.join)(dir, 'pnpm-workspace.yaml')))
            return dir;
        const up = (0, node_path_1.dirname)(dir);
        if (up === dir)
            throw new Error('workspace root not found');
        dir = up;
    }
}
/**
 * §7 — "WORKSPACE IS A FEATURE jo ke har member kar sakta hai" [09:29].
 *
 * The old rule was `user.role !== 'super_admin'` — one line, and the whole of
 * what she called missing at [10:03]. The interesting half of the new rule is
 * not that members can create; it is that the exclusions are exactly two, and
 * that a role invented next year is not silently one of them.
 */
(0, node_test_1.describe)('who may create a workspace (§7)', () => {
    (0, node_test_1.it)('lets every ordinary role create one — that is the whole point', () => {
        for (const role of ['member', 'manager', 'workspace_admin', 'super_admin']) {
            strict_1.default.ok((0, workspace_creation_policy_1.canCreateWorkspace)(role), `${role} should be able to create a workspace`);
        }
    });
    (0, node_test_1.it)('does not let a guest', () => {
        // "jo GUEST hai sirf woh create NAHI kar sakta" [09:22].
        strict_1.default.equal((0, workspace_creation_policy_1.canCreateWorkspace)('guest'), false);
    });
    (0, node_test_1.it)('does not let a viewer, for when there is one', () => {
        /*
         * She names viewer too — "agar koi VIEWER side pe hai to woh bhi nahi"
         * [09:26] — but she is describing ClickUp. Rundesk has no viewer identity:
         * read-only access is a per-container grant, not a kind of person. The name
         * is in the deny-list anyway so that introducing the role later cannot
         * accidentally hand it workspace creation, which is the direction this
         * mistake would go.
         */
        strict_1.default.equal((0, workspace_creation_policy_1.canCreateWorkspace)('viewer'), false);
    });
    (0, node_test_1.it)('treats a role it has never heard of as allowed, deliberately', () => {
        /*
         * This is the deny-list choice, and it is worth being explicit that it is a
         * choice. An allow-list would mean any role added later arrives unable to
         * create a workspace for no reason anyone decided — and it would read as a
         * permissions bug rather than a missing line in a list. Her rule is phrased
         * the same way: "baaqi sab create kar sakte hain."
         */
        strict_1.default.ok((0, workspace_creation_policy_1.canCreateWorkspace)('some_future_role'));
    });
    (0, node_test_1.it)('refuses a caller with no role at all', () => {
        // Not a licence: every authenticated caller has one, so this is a malformed
        // token or a row mid-migration.
        for (const role of [null, undefined, '']) {
            strict_1.default.equal((0, workspace_creation_policy_1.canCreateWorkspace)(role), false, `${String(role)} should not create`);
        }
    });
    /**
     * §7 — the answers the flow collects have to survive the trip.
     *
     * The global ValidationPipe runs whitelist: true, so a field absent from
     * CreateWorkspaceDto is stripped before the handler ever sees it. That is
     * precisely how §1.1's taskTypeId went missing: the client sent it, the
     * server never received it, and nothing reported a problem — the task simply
     * got the wrong type. Same class had these been added to the body and not the
     * DTO.
     */
    (0, node_test_1.it)('declares purpose and comingFrom on the DTO, or they never arrive', () => {
        const dto = (0, node_fs_1.readFileSync)((0, node_path_1.join)(workspaceRoot(process.cwd()), 'apps/api/src/modules/workspaces/dto/create-workspace.dto.ts'), 'utf8');
        strict_1.default.match(dto, /purpose\?: string/, 'purpose is not on the DTO — the pipe will strip it');
        strict_1.default.match(dto, /comingFrom\?: string/, 'comingFrom is not on the DTO — the pipe will strip it');
        // And purpose is constrained, since it decides what the workspace starts with.
        strict_1.default.match(dto, /IsIn\(\['work', 'personal', 'school'\]\)/, 'purpose accepts anything');
    });
    (0, node_test_1.it)('stores both, rather than asking and discarding', () => {
        const svc = (0, node_fs_1.readFileSync)((0, node_path_1.join)(workspaceRoot(process.cwd()), 'apps/api/src/modules/workspaces/workspaces.service.ts'), 'utf8');
        strict_1.default.match(svc, /purpose: dto\.purpose \?\? null/, 'purpose is collected and thrown away');
        strict_1.default.match(svc, /comingFrom: dto\.comingFrom \?\? null/, 'comingFrom is collected and thrown away');
    });
    (0, node_test_1.it)('gives a new workspace somewhere to land', () => {
        /*
         * A workspace with no space has no project, so no list — and the sidebar,
         * the create modal and every list view have nothing to show. The frame pass
         * flagged exactly that state.
         */
        const svc = (0, node_fs_1.readFileSync)((0, node_path_1.join)(workspaceRoot(process.cwd()), 'apps/api/src/modules/workspaces/workspaces.service.ts'), 'utf8');
        const create = /async create\([\s\S]*?\n {2}async /.exec(svc)?.[0] ?? '';
        strict_1.default.ok(create, 'could not find create');
        for (const table of ['spaces', 'projects', 'lists']) {
            strict_1.default.match(create, new RegExp(`insert\\(${table}\\)`), `a new workspace has no ${table}`);
        }
        // And the starter content follows the answer, which is why it was asked.
        strict_1.default.match(svc, /STARTER_CONTENT\[dto\.purpose/, 'purpose does not shape what the workspace starts with');
    });
    (0, node_test_1.it)('is what the endpoint actually enforces', () => {
        /*
         * The policy being right is worth nothing if the controller still carries
         * its own copy of the old rule. Read at the source rather than constructing
         * a Nest controller: this is the weaker claim and is labelled as one.
         */
        const controller = (0, node_fs_1.readFileSync)((0, node_path_1.join)(workspaceRoot(process.cwd()), 'apps/api/src/modules/workspaces/workspaces.controller.ts'), 'utf8');
        // Scoped to the create handler. A first version of this asserted the whole
        // file was free of `role !== 'super_admin'` and failed — correctly, on
        // setPlan, which reserves *commercial plan changes* to a super admin and
        // has nothing to do with who may make a workspace. Condemning that would
        // have been the test being wrong, loudly.
        const create = /async create\([\s\S]*?\n {2}\}/.exec(controller)?.[0] ?? '';
        strict_1.default.ok(create, 'could not find the create handler');
        strict_1.default.match(create, /canCreateWorkspace\(user\.role\)/, 'the endpoint does not use the policy');
        strict_1.default.ok(!/super_admin/.test(create), `the Super-Admin-only check is still in create: ${create.slice(0, 200)}`);
    });
});
//# sourceMappingURL=workspace-creation-policy.test.js.map