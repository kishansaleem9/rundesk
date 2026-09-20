"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
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
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(workspaceRoot(process.cwd()), rel), 'utf8');
/**
 * §G08 [08:35–09:57] — an org-admin roster is not a window into every
 * workspace.
 *
 * `listWorkspaces` returned `select()`: every column of every workspace in the
 * organization, to an admin who need not belong to any of them. Among those is
 * `customDomainToken` — the `rundesk-verify=…` secret that proves control of a
 * domain — alongside branding and the `purpose`/`comingFrom` answers somebody
 * gave inside their own workspace.
 *
 * The single caller asks for four fields, so the breadth bought nothing.
 *
 * Asserted as "the projection is explicit", not "these exact columns", because
 * the property that failed is publishing-by-default: a bare `select()` hands
 * this audience whatever the table grows next.
 */
(0, node_test_1.describe)('§G08 the org workspace roster is a roster', () => {
    const svc = read('apps/api/src/modules/organizations/organizations.service.ts');
    const body = /async listWorkspaces\(organizationId: string\) \{([\s\S]*?)\n {2}\}/.exec(svc)?.[1] ?? '';
    (0, node_test_1.it)('projects explicit columns rather than the whole row', () => {
        strict_1.default.ok(body, 'could not find listWorkspaces');
        strict_1.default.ok(!/\.select\(\)/.test(body), 'listWorkspaces selects every column again — a new one is published to org admins by default');
        strict_1.default.match(body, /\.select\(\{/, 'the projection is no longer explicit');
    });
    (0, node_test_1.it)('does not hand out the domain-verification secret', () => {
        strict_1.default.ok(!/customDomainToken/.test(body), 'the roster exposes customDomainToken to admins outside the workspace');
    });
    (0, node_test_1.it)('still answers what the roster is for', () => {
        for (const field of ['id', 'name', 'slug', 'plan']) {
            strict_1.default.match(body, new RegExp(`\\b${field}:`), `the roster no longer returns ${field}`);
        }
    });
    (0, node_test_1.it)('leaves the member-facing list filtering by membership', () => {
        /*
         * Her actual claim — "woh meri email pe ban rahi hai", it is mine until I
         * share it — is about what a MEMBER sees, and that path joins through
         * workspace_members. If that ever stops, the privacy she describes is gone
         * regardless of what the admin roster does.
         */
        const ws = read('apps/api/src/modules/workspaces/workspaces.service.ts');
        const findBy = /async findByMember\(userId: string\) \{([\s\S]*?)\n {2}\}/.exec(ws)?.[1] ?? '';
        strict_1.default.ok(findBy, 'could not find findByMember');
        /*
         * The WHERE, not the mention.
         *
         * The first version of this asserted that `workspaceMembers` appeared
         * somewhere in the method — and it still does, in `.from()` and
         * `.innerJoin()`, with the user filter deleted. It passed on a version that
         * returned every workspace in the system to everybody. What has to hold is
         * that the query is constrained to THIS user.
         */
        strict_1.default.match(findBy, /eq\(workspaceMembers\.userId,\s*userId\)/, `a member’s workspace list is not filtered to them: ${findBy.trim().slice(0, 200)}`);
    });
});
//# sourceMappingURL=org-workspace-roster.test.js.map