"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const drive_scope_1 = require("./drive-scope");
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
 * §G03 [04:04–04:32] — the scope we ask for has to answer the query we send.
 *
 * These were maintained independently and disagreed: the OAuth grant requested
 * `drive.file` — files this app created or the user picked by hand — while the
 * search issued an account-wide `name contains '…'`. Drive answered "nothing",
 * every time, with no error. An empty section reads as "no matching files",
 * which is a lie about somebody's Drive.
 *
 * Two halves that must agree, in two different modules, is exactly the shape
 * that drifts. So this asserts they agree rather than that either one is a
 * particular string.
 */
(0, node_test_1.describe)('§G03 the Drive grant can answer the Drive query', () => {
    const connections = read('apps/api/src/modules/integrations/connections/integration-connections.service.ts');
    const search = read('apps/api/src/modules/search/search.service.ts');
    (0, node_test_1.it)('asks for the scope from the shared constant, not a literal', () => {
        // A literal here is how the two drifted the first time.
        strict_1.default.match(connections, /DRIVE_SEARCH_SCOPE/, 'the OAuth scope list no longer uses the constant');
        strict_1.default.ok(!/auth\/drive\.file/.test(connections), 'the connection still requests drive.file, which cannot see a user’s own Drive');
    });
    (0, node_test_1.it)('issues an account-wide query, which is what that scope is for', () => {
        const q = /q: `([^`]*)`/.exec(search)?.[1] ?? '';
        strict_1.default.ok(q, 'could not find the Drive query');
        strict_1.default.match(q, /name contains/, 'the Drive query no longer searches by name');
        // If the query is ever narrowed to app-created files, the broad consent is
        // no longer justified and this should be revisited deliberately.
        strict_1.default.ok(!/appDataFolder|'me' in owners/.test(q), `the query was narrowed (${q}) — the broad scope is no longer warranted`);
    });
    (0, node_test_1.it)('refuses to send an account-wide query on a grant that cannot answer it', () => {
        strict_1.default.match(search, /grantCoversWholeDrive\(conn\.scopes\)/, 'search no longer checks the stored grant, so an old connection silently returns nothing');
    });
    (0, node_test_1.it)('recognises the grant it asks for, and nothing less', () => {
        strict_1.default.equal((0, drive_scope_1.grantCoversWholeDrive)([drive_scope_1.DRIVE_SEARCH_SCOPE]), true);
        strict_1.default.equal((0, drive_scope_1.grantCoversWholeDrive)(['https://www.googleapis.com/auth/drive.file']), false);
        strict_1.default.equal((0, drive_scope_1.grantCoversWholeDrive)([]), false);
        strict_1.default.equal((0, drive_scope_1.grantCoversWholeDrive)(null), false);
        strict_1.default.equal((0, drive_scope_1.grantCoversWholeDrive)(undefined), false);
    });
});
//# sourceMappingURL=drive-scope.test.js.map