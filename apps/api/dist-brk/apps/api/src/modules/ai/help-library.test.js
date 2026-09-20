"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const knowledge_1 = require("./knowledge");
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
 * The help library has to contain the things the assistant cites.
 *
 * `answerHelp` returns sources built by `helpTopicToSource`, whose url is
 * `/app/help#help-<id>`. The page hand-wrote four cards out of ten topics, and
 * `openSource` resolved a citation with `document.getElementById(...)` and
 * returned silently when it found nothing.
 *
 * So for six of the ten topics the product generated its own dead link: the
 * assistant answered, offered a source, and clicking it did nothing at all —
 * not an error, not a scroll, nothing. That is worse than not offering the
 * source, because it reads as a broken page rather than a missing feature.
 *
 * These checks are cross-cutting on purpose. The bug did not live in either
 * half; it lived in the fact that two halves each had their own list.
 */
(0, node_test_1.describe)('the help library covers every topic the assistant can cite', () => {
    const controller = read('apps/api/src/modules/ai/ai.controller.ts');
    const page = read('apps/web/src/pages/app-help-page.tsx');
    (0, node_test_1.it)('has enough topics for this to be worth checking', () => {
        // A knowledge base that had quietly emptied would make everything below
        // vacuously true.
        strict_1.default.ok(knowledge_1.HELP_TOPICS.length >= 10, `only ${knowledge_1.HELP_TOPICS.length} help topics`);
    });
    (0, node_test_1.it)('serves them over HTTP', () => {
        strict_1.default.match(controller, /@Get\('help\/topics'\)/, 'there is no endpoint to read the library from');
        strict_1.default.match(controller, /HELP_TOPICS\.map\(/, 'the endpoint does not derive from HELP_TOPICS, so it can drift from what the assistant answers with');
    });
    (0, node_test_1.it)('does not hand out the matching keywords', () => {
        /*
         * Keywords are fuel for the deterministic fallback — 'todo', 'seat',
         * 'item'. They are not prose, and shipping them to a page that renders
         * topics would put them on screen.
         */
        const handler = /@Get\('help\/topics'\)[\s\S]{0,400}?\n {2}\}/.exec(controller)?.[0] ?? '';
        strict_1.default.ok(handler, 'could not read the topics handler');
        strict_1.default.ok(!/keywords/.test(handler), `the endpoint returns keywords: ${handler.slice(0, 200)}`);
    });
    (0, node_test_1.it)('every citation points at an anchor the page renders', () => {
        // The invariant that was broken. The page renders `help-${faq.id}` per
        // card, so this holds exactly when the card list comes from the topic list.
        for (const topic of knowledge_1.HELP_TOPICS) {
            strict_1.default.equal((0, knowledge_1.helpTopicToSource)(topic).url, `/app/help#help-${topic.id}`, `${topic.id} cites something other than its own anchor`);
        }
        strict_1.default.match(page, /id=\{`help-\$\{faq\.id\}`\}/, 'the page no longer anchors its cards by topic id');
    });
    (0, node_test_1.it)('renders a card per topic rather than a hand-written four', () => {
        /*
         * The check that would have caught the original bug, and the one that
         * catches it coming back. Four authored cards are fine — they carry
         * formatting plain text cannot — but the list rendered has to be the
         * authored ones *merged with* whatever the server curates.
         */
        strict_1.default.match(page, /'\/ai\/help\/topics'/, 'the page never asks for the curated topics');
        /*
         * Read as "no branch of this renders the authored four alone".
         *
         * The first version of this asserted only that `allFaqs` appeared
         * somewhere in the assignment — and passed when the unfiltered branch was
         * put back to `faqs`, which is the original bug exactly. It survived
         * because the filtered branch says `allFaqs.filter(...)` and one match was
         * enough. Break-testing is the only reason that was noticed.
         */
        const rendered = /const filteredFaqs =([\s\S]*?)\n\n/.exec(page)?.[1] ?? '';
        strict_1.default.ok(rendered, 'could not find what the page renders');
        strict_1.default.match(rendered, /allFaqs/, 'the cards rendered do not come from the merged list');
        strict_1.default.ok(!/\bfaqs\b/.test(rendered.replace(/allFaqs/g, '')), `one branch still renders the hand-written four alone: ${rendered.trim()}`);
        const merge = /const allFaqs = useMemo\(([\s\S]*?)\n {2}\}, \[/.exec(page)?.[1] ?? '';
        strict_1.default.ok(merge, 'could not find where the two lists are merged');
        strict_1.default.match(merge, /topicsQuery\.data/, 'the merge ignores what the server sent');
        strict_1.default.match(merge, /authored\.has\(topic\.id\)/, 'the merge does not key on id, so an authored card and its topic would both render');
    });
    (0, node_test_1.it)('a citation that arrives before the list does is not swallowed', () => {
        // The one remaining way to click a source and reach nothing. It now falls
        // through to the browser rather than returning silently.
        const open = /function openSource\(([\s\S]*?)\n {2}\}/.exec(page)?.[1] ?? '';
        strict_1.default.ok(open, 'could not find openSource');
        strict_1.default.match(open, /window\.location\.hash = anchor/, 'an unresolved citation still does nothing');
    });
});
//# sourceMappingURL=help-library.test.js.map