"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ai_service_1 = require("./ai.service");
const follow_ups_1 = require("./follow-ups");
/**
 * G13-9 [18:42] — the follow-up chips, and the marker that must never be seen.
 *
 * The answer carries its own suggestions after a marker so that offering them
 * costs no second model call. The price of that is a splitter running on every
 * delta of every AI turn in the product, where the failure mode is showing
 * somebody `<<<FOLLOW` in the middle of a sentence.
 *
 * So these tests are mostly about chunk boundaries. A model streams in
 * arbitrary pieces, and the marker will land split across them — the question
 * is never "does indexOf work" but "what happens when it half-works".
 */
/** Feed `text` through the splitter in fixed-size pieces. */
function stream(text, size) {
    const s = (0, follow_ups_1.createFollowUpSplitter)();
    let visible = '';
    for (let i = 0; i < text.length; i += size)
        visible += s.push(text.slice(i, i + size));
    visible += s.flush();
    return { visible, followUps: s.followUps() };
}
const ANSWER = 'You have three tasks due today, and one is overdue.';
const BLOCK = `${follow_ups_1.FOLLOW_UP_MARKER}\n- Show me the overdue one\n- Move it to tomorrow\n- Draft a note to the owner`;
(0, node_test_1.describe)('G13-9 — follow-ups ride the answer without leaking the marker', () => {
    (0, node_test_1.it)('never shows the marker, at any chunk size', () => {
        const full = `${ANSWER}\n${BLOCK}`;
        // 1 is the adversarial case — every character its own delta, so the marker
        // is split at every possible offset.
        for (const size of [1, 2, 3, 5, 7, 13, 16, 17, 64, 4096]) {
            const { visible, followUps } = stream(full, size);
            strict_1.default.ok(!visible.includes('<<<') && !visible.includes('FOLLOW_UPS'), `chunk size ${size} leaked part of the marker: ${JSON.stringify(visible.slice(-40))}`);
            strict_1.default.equal(visible.trimEnd(), ANSWER, `chunk size ${size} mangled the answer`);
            strict_1.default.deepEqual(followUps, [
                'Show me the overdue one',
                'Move it to tomorrow',
                'Draft a note to the owner',
            ]);
        }
    });
    (0, node_test_1.it)('keeps text that merely looked like the start of a marker', () => {
        /*
         * The regression the held-back buffer exists to avoid in the other
         * direction: holding "<<" back is correct while more might follow, and
         * losing it when nothing does is not. An answer legitimately ending in
         * "<<" is odd but it is the user's text, and swallowing it would be a
         * silent edit.
         */
        const { visible, followUps } = stream('compare a << b in C++', 1);
        strict_1.default.equal(visible, 'compare a << b in C++');
        strict_1.default.deepEqual(followUps, []);
    });
    (0, node_test_1.it)('gives back text held at the very end that never became a marker', () => {
        /*
         * The case flush() exists for, and the one the test above does NOT cover:
         * there the answer ends in "+", so nothing is being held when the stream
         * closes. Here the last characters ARE a marker prefix, so they sit in the
         * buffer waiting for more that never comes — and dropping them silently
         * edits somebody's answer.
         *
         * Written after a break test: deleting the release in flush() failed
         * nothing, because every existing case happened to end on a character the
         * marker does not start with.
         */
        for (const ending of ['<', '<<', '<<<', '<<<FOLLOW']) {
            const text = `see the operator ${ending}`;
            const { visible, followUps } = stream(text, 1);
            strict_1.default.equal(visible, text, `lost the trailing ${JSON.stringify(ending)}`);
            strict_1.default.deepEqual(followUps, []);
        }
    });
    (0, node_test_1.it)('passes an answer through untouched when there is no block at all', () => {
        // The common case: most turns should offer no follow-ups, and the model is
        // told to omit the block entirely rather than invent a next step.
        const { visible, followUps } = stream(ANSWER, 3);
        strict_1.default.equal(visible, ANSWER);
        strict_1.default.deepEqual(followUps, []);
    });
    (0, node_test_1.it)('does not delay text it has no reason to hold', () => {
        // Latency matters here: this runs on every delta. Only a genuine suffix of
        // the marker may be held, so ordinary prose streams straight through.
        const s = (0, follow_ups_1.createFollowUpSplitter)();
        strict_1.default.equal(s.push('You have three '), 'You have three ');
        strict_1.default.equal(s.push('tasks due today.'), 'tasks due today.');
    });
    (0, node_test_1.it)('holds back only the part that could still become the marker', () => {
        const s = (0, follow_ups_1.createFollowUpSplitter)();
        // "done.<" — the "<" could start the marker, the rest cannot.
        strict_1.default.equal(s.push('done.<'), 'done.');
        // It turns out to be a comparison, so the held text is released with it.
        strict_1.default.equal(s.push('3 items'), '<3 items');
    });
    (0, node_test_1.it)('drops empties, over-long lines and anything past the third', () => {
        strict_1.default.deepEqual((0, follow_ups_1.parseFollowUps)('\n- one\n\n- two\n- three\n- four\n'), ['one', 'two', 'three']);
        strict_1.default.deepEqual((0, follow_ups_1.parseFollowUps)(`- ok\n- ${'x'.repeat(200)}\n`), ['ok']);
    });
    (0, node_test_1.it)('accepts the bullet and numbering styles models actually produce', () => {
        strict_1.default.deepEqual((0, follow_ups_1.parseFollowUps)('* one\n• two\n1. three'), ['one', 'two', 'three']);
    });
    (0, node_test_1.it)('treats a marker with nothing after it as no suggestions', () => {
        const { visible, followUps } = stream(`${ANSWER}\n${follow_ups_1.FOLLOW_UP_MARKER}`, 4);
        strict_1.default.equal(visible.trimEnd(), ANSWER);
        strict_1.default.deepEqual(followUps, []);
    });
    (0, node_test_1.it)('actually asks the model for them', async () => {
        /*
         * Everything above feeds the splitter text that already contains a marker,
         * so all of it passes even when the model is never told to produce one —
         * and then the feature is simply dead in production, with a full green
         * suite behind it. A break test removing FOLLOW_UP_INSTRUCTION from the
         * system prompt failed nothing, which is why this exists.
         */
        let captured = '';
        const service = new ai_service_1.AiService({ get: () => 'test-key' }, {}, {});
        service.assertWithinRateLimit =
            async () => { };
        service.recordUsage = () => { };
        service.client = {
            messages: {
                stream: (params) => {
                    const system = params.system;
                    captured = Array.isArray(system)
                        ? String(system[0]?.text ?? '')
                        : String(system ?? '');
                    return {
                        async *[Symbol.asyncIterator]() {
                            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } };
                        },
                        finalMessage: async () => ({ usage: { input_tokens: 1, output_tokens: 1 } }),
                    };
                },
            },
        };
        const res = {
            hijack: () => { },
            raw: { setHeader: () => { }, flushHeaders: () => { }, write: () => { }, end: () => { } },
        };
        await service.chatStream([{ role: 'user', content: 'hi' }], 'Workspace: Acme', res);
        strict_1.default.ok(captured.includes(follow_ups_1.FOLLOW_UP_MARKER), 'the prompt names the marker the splitter is looking for');
        strict_1.default.ok(captured.includes(follow_ups_1.FOLLOW_UP_INSTRUCTION), 'and carries the whole instruction');
    });
});
//# sourceMappingURL=follow-ups.test.js.map