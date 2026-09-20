"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const feature_flags_1 = require("@rundesk/feature-flags");
const signup_features_1 = require("./signup-features");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/*
 * Found by walking up for the workspace marker, rather than from
 * `import.meta.url` or `process.cwd()`.
 *
 * `import.meta.dirname` is undefined under the tsx loader these tests run
 * with, and `import.meta.url` compiles fine there but breaks `tsc -p
 * tsconfig.build.json`, whose module setting forbids the meta-property — so a
 * test file took the whole API build down with it. cwd is no better: it is
 * apps/api today and would silently stop resolving the moment tests are
 * launched from anywhere else.
 */
function repoRoot() {
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
        if ((0, node_fs_1.existsSync)((0, node_path_1.join)(dir, 'pnpm-workspace.yaml')))
            return dir;
        dir = (0, node_path_1.dirname)(dir);
    }
    throw new Error('could not find the repo root from ' + __dirname);
}
const HERE = __dirname;
const REPO = repoRoot();
/**
 * G08-4 [08:43], [09:02] — the feature picker has to actually pick.
 *
 * The wizard's second step promises, in as many words: "Pick what you'll use —
 * we'll turn the rest off so the workspace stays uncluttered." The picks were
 * sent, the DTO declared them, and `signUp()` read them nowhere. The sentence
 * was false and the workspace came up with platform defaults whatever anybody
 * ticked.
 *
 * Two things can go wrong here and neither is visible from a screenshot:
 *
 *  1. a pill that governs no flags — a checkbox with no effect, which is the
 *     same defect wearing a different hat
 *  2. the wizard and the server disagreeing about the set of pills, so a pill
 *     is offered that the server ignores, or a flag is switched off for a
 *     question nobody was asked
 *
 * The second is why these tests read the wizard's own list out of the source
 * rather than restating it: a copy would drift, and drift is the failure.
 */
const WIZARD = (0, node_fs_1.readFileSync)((0, node_path_1.join)(REPO, 'apps/web/src/pages/sign-up-page.tsx'), 'utf8');
/** The pill keys the signup wizard actually offers, read off the source. */
function wizardPillKeys() {
    const block = /const FEATURE_PILLS = \[(.*?)\] as const/s.exec(WIZARD)?.[1] ?? '';
    return [...block.matchAll(/\{\s*key:\s*'([^']+)'/g)].map((m) => m[1]);
}
(0, node_test_1.describe)('G08-4 — the signup feature picker configures the workspace', () => {
    (0, node_test_1.it)('offers no pill that governs nothing', () => {
        for (const [pill, keys] of Object.entries(feature_flags_1.SIGNUP_FEATURE_FLAGS)) {
            strict_1.default.ok(Array.isArray(keys) && keys.length > 0, `pill "${pill}" governs no flags`);
        }
    });
    (0, node_test_1.it)('covers every pill the wizard shows', () => {
        const offered = wizardPillKeys();
        strict_1.default.ok(offered.length >= 10, `only found ${offered.length} pills — the regex probably drifted`);
        const missing = offered.filter((key) => !feature_flags_1.SIGNUP_FEATURE_FLAGS[key]);
        strict_1.default.deepEqual(missing, [], `the wizard offers pills the server does nothing with: ${missing.join(', ')}`);
    });
    (0, node_test_1.it)('governs no pill the wizard does not show', () => {
        // The other direction: a mapping entry with no pill would switch features
        // off for a question the user was never asked.
        const offered = new Set(wizardPillKeys());
        const orphans = Object.keys(feature_flags_1.SIGNUP_FEATURE_FLAGS).filter((key) => !offered.has(key));
        strict_1.default.deepEqual(orphans, [], `the server acts on pills nobody is offered: ${orphans.join(', ')}`);
    });
    (0, node_test_1.it)('names only real flags', () => {
        const known = new Set(Object.values(feature_flags_1.FLAGS));
        for (const [pill, keys] of Object.entries(feature_flags_1.SIGNUP_FEATURE_FLAGS)) {
            for (const key of keys) {
                strict_1.default.ok(known.has(key), `pill "${pill}" names "${key}", which is not a flag`);
            }
        }
    });
    (0, node_test_1.it)('keeps the category pills in step with the categories themselves', () => {
        // These delegate rather than restate, so a flag added to a category is
        // covered by signup automatically. If someone inlines the list instead,
        // this catches the copy going stale.
        for (const pill of ['core', 'views', 'ai', 'chat', 'time_tracking', 'reporting', 'integrations']) {
            strict_1.default.deepEqual(feature_flags_1.SIGNUP_FEATURE_FLAGS[pill], feature_flags_1.FLAG_CATEGORIES[pill], `pill "${pill}" has drifted from FLAG_CATEGORIES.${pill}`);
        }
    });
    (0, node_test_1.it)('leaves auth alone, because the wizard never asks about it', () => {
        // Writing rows for settings the user never saw would be its own dishonesty
        // — and switching SSO off for somebody who did not choose that would lock
        // a workspace out of the login they expected.
        const governed = new Set(Object.values(feature_flags_1.SIGNUP_FEATURE_FLAGS).flat());
        for (const authFlag of feature_flags_1.FLAG_CATEGORIES.auth) {
            strict_1.default.ok(!governed.has(authFlag), `signup must not touch ${authFlag}`);
        }
    });
    (0, node_test_1.it)('turns the picks into rows that say on for chosen and off for the rest', () => {
        // The behaviour the false copy promised, checked directly rather than
        // through eight mocked inserts.
        const rows = (0, signup_features_1.signupFeatureRows)(['docs', 'goals'], { id: 'ws1' }, 'u1');
        const byKey = new Map(rows.map((r) => [r.flagKey, r]));
        strict_1.default.equal(byKey.get(feature_flags_1.FLAGS.DOCS)?.enabled, true, 'a chosen pill is on');
        strict_1.default.equal(byKey.get(feature_flags_1.FLAGS.GOALS)?.enabled, true, 'and so is the other one');
        strict_1.default.equal(byKey.get(feature_flags_1.FLAGS.CHAT)?.enabled, false, '"we\'ll turn the rest off"');
        strict_1.default.equal(byKey.get(feature_flags_1.FLAGS.AI)?.enabled, false, 'including the expensive rest');
        // Scoped to the workspace that was just made, and attributed.
        for (const row of rows) {
            strict_1.default.equal(row.scope, 'workspace');
            strict_1.default.equal(row.scopeId, 'ws1');
            strict_1.default.equal(row.workspaceId, 'ws1');
            strict_1.default.equal(row.updatedBy, 'u1');
        }
        // Auth is untouched: nobody was asked.
        for (const authFlag of feature_flags_1.FLAG_CATEGORIES.auth) {
            strict_1.default.ok(!byKey.has(authFlag), `signup wrote a row for ${authFlag}`);
        }
    });
    (0, node_test_1.it)('tells "unticked everything" apart from "never saw the picker"', () => {
        /*
         * An absent list means an API client, or an older web build, that never
         * went through the wizard. Switching every feature off for them would be a
         * silent, destructive answer to a question they were never asked — so it
         * writes nothing and the platform defaults stand.
         *
         * An empty array is a real answer, and is honoured.
         */
        strict_1.default.deepEqual((0, signup_features_1.signupFeatureRows)(undefined, { id: 'ws1' }, 'u1'), []);
        const emptied = (0, signup_features_1.signupFeatureRows)([], { id: 'ws1' }, 'u1');
        strict_1.default.ok(emptied.length > 0, 'an explicit empty pick still writes rows');
        strict_1.default.ok(emptied.every((r) => r.enabled === false), 'and they are all off');
    });
    (0, node_test_1.it)('no longer asks for anything nobody reads', () => {
        /*
         * `industry` and `teamSize` were REQUIRED to advance past step 1
         * (sign-up-page.tsx canAdvance) and were read by nothing on the server —
         * two compulsory questions collecting data with no consumer.
         *
         * The walkthrough settles it: across 386 transcript lines and 143
         * catalogued frames she never says either word, and the ClickUp wizard she
         * holds up as the model does not ask them either.
         *
         * Asserted on the wizard AND the DTO, because leaving the field on the DTO
         * is how it comes back — somebody sees it and wires a form to it.
         */
        strict_1.default.ok(!/industry/i.test(WIZARD), 'the wizard is asking about industry again');
        strict_1.default.ok(!/teamSize/i.test(WIZARD), 'the wizard is asking about team size again');
        const dto = (0, node_fs_1.readFileSync)((0, node_path_1.join)(HERE, 'dto/signup.dto.ts'), 'utf8');
        const declared = dto.replace(/\/\*[\s\S]*?\*\//g, '');
        strict_1.default.ok(!/industry\?:/.test(declared), 'the signup DTO declares industry again');
        strict_1.default.ok(!/teamSize\?:/.test(declared), 'the signup DTO declares teamSize again');
    });
    (0, node_test_1.it)('is actually read by signUp', () => {
        /*
         * The check that would have caught the original bug. Everything above can
         * pass with the mapping sitting in a file nothing imports — which is
         * exactly the state this gap describes: the picks were sent, declared, and
         * read by nobody.
         */
        const authService = (0, node_fs_1.readFileSync)((0, node_path_1.join)(HERE, 'auth.service.ts'), 'utf8');
        strict_1.default.match(authService, /signupFeatureRows/, 'auth.service.ts does not call the row builder at all');
        strict_1.default.match(authService, /dto\.features/, 'auth.service.ts never reads the features the wizard sent');
    });
});
//# sourceMappingURL=signup-features.test.js.map