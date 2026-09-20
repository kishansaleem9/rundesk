"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ai_service_1 = require("./ai.service");
/**
 * §2.8 — "Get instant answers and insights from your meetings" (frame `310`).
 *
 * The failure mode worth guarding is not a bad answer, it is a CONFIDENT one
 * about meetings that were never recorded. Someone asking "what did we decide
 * about pricing" and getting a fluent paragraph invented from a title has been
 * actively misled, and nothing on screen distinguishes that from a real answer.
 */
function service(available, capture = {}) {
    const svc = new ai_service_1.AiService({ get: () => (available ? 'test-key' : undefined) }, {}, {});
    svc.assertWithinRateLimit = async () => { };
    svc.recordUsage = () => { };
    if (available) {
        ;
        svc.client = {
            messages: {
                create: async (params) => {
                    capture.params = params;
                    return { content: [{ type: 'text', text: 'They decided to raise prices in Q3.' }], usage: {} };
                },
            },
        };
    }
    return svc;
}
const MEETINGS = [
    {
        title: 'Pricing review',
        startsAt: new Date('2026-08-12T10:00:00Z'),
        notes: 'Agreed to raise prices in Q3.',
        attendees: ['Hamda', 'Leo'],
    },
    { title: 'Standup', startsAt: new Date('2026-08-13T09:00:00Z'), notes: null, attendees: [] },
];
(0, node_test_1.describe)('§2.8 asking about your meetings', () => {
    (0, node_test_1.it)('answers from the records it was given', async () => {
        const capture = {};
        const result = await service(true, capture).askAboutMeetings('What did we decide?', MEETINGS);
        strict_1.default.equal(result.grounded, true);
        strict_1.default.match(result.answer, /raise prices/);
        // The records really did reach the model, rather than the question going
        // up alone and the answer being invented.
        const sent = JSON.stringify(capture.params);
        strict_1.default.match(sent, /Pricing review/);
        strict_1.default.match(sent, /Agreed to raise prices in Q3/);
        strict_1.default.match(sent, /2026-08-12/, 'the date was not sent, so the answer cannot cite one');
        strict_1.default.match(sent, /Hamda/, 'attendees were not sent');
    });
    (0, node_test_1.it)('tells the model to say when a meeting has no notes', async () => {
        // The specific way this misleads: a meeting called "Pricing review" with
        // nothing kept invites the model to describe what was "discussed".
        const capture = {};
        await service(true, capture).askAboutMeetings('What happened?', MEETINGS);
        // `complete()` wraps a long system prompt in a cache_control block, so it
        // arrives as an array rather than the string that was passed in.
        const raw = capture.params?.system;
        // Whitespace-normalised: the prompt is hard-wrapped for readability, so a
        // phrase can straddle a line break. A test that fails when a comment is
        // rewrapped is testing the formatting, not the instruction.
        const system = (Array.isArray(raw) ? String(raw[0]?.text ?? '') : String(raw ?? '')).replace(/\s+/g, ' ');
        strict_1.default.match(system, /no notes kept/i);
        strict_1.default.match(system, /do not fill the gap/i);
        strict_1.default.match(system, /ONLY the records/);
        // And the empty one is passed through as empty rather than omitted.
        strict_1.default.match(JSON.stringify(capture.params), /\(no notes were kept\)/);
    });
    (0, node_test_1.it)('refuses rather than improvising when there is nothing recorded', async () => {
        const result = await service(true).askAboutMeetings('What did we decide?', []);
        strict_1.default.equal(result.grounded, false);
        strict_1.default.match(result.answer, /no meetings recorded/i);
        // And it says what to do about it, rather than just declining.
        strict_1.default.match(result.answer, /Meeting notes tab/);
    });
    (0, node_test_1.it)('says plainly when no model is configured, and how much it could see', async () => {
        const result = await service(false).askAboutMeetings('What did we decide?', MEETINGS);
        strict_1.default.equal(result.grounded, false);
        strict_1.default.match(result.answer, /2 meeting/);
        strict_1.default.match(result.answer, /no model is configured/i);
    });
    (0, node_test_1.it)('marks a real answer as grounded and a fallback as not', async () => {
        // `grounded` is what the UI uses to decide whether to present an answer as
        // an answer. Getting it backwards would dress a refusal up as a finding.
        strict_1.default.equal((await service(true).askAboutMeetings('x', MEETINGS)).grounded, true);
        strict_1.default.equal((await service(true).askAboutMeetings('x', [])).grounded, false);
        strict_1.default.equal((await service(false).askAboutMeetings('x', MEETINGS)).grounded, false);
    });
});
//# sourceMappingURL=meetings-ask.test.js.map