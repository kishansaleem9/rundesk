"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ai_service_1 = require("./ai.service");
/**
 * §15 — a skill has to actually reach the model, or the whole feature is a CRUD
 * app for text that never changes an answer.
 *
 * These tests capture the system prompt `chatStream` hands to Anthropic. Two
 * things matter and neither is visible from the outside: that the skill's own
 * words come *first* (so a default two lines below cannot overrule them), and
 * that a turn without a skill is unchanged from what it was before skills
 * existed.
 */
/** Capture the params of the streamed call without hitting the network. */
function captureStream() {
    const captured = {};
    const service = new ai_service_1.AiService({ get: () => 'test-key' }, {}, {});
    service.assertWithinRateLimit =
        async () => { };
    service.recordUsage = () => { };
    service.client = {
        messages: {
            stream: (params) => {
                captured.system = params.system;
                captured.model = params.model;
                return {
                    async *[Symbol.asyncIterator]() {
                        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } };
                    },
                    finalMessage: async () => ({ usage: { input_tokens: 1, output_tokens: 1 } }),
                };
            },
        },
    };
    // Fastify-shaped response: hijack + reply.raw, as the real handler receives.
    const written = [];
    const res = {
        hijack: () => { },
        raw: {
            setHeader: () => { },
            flushHeaders: () => { },
            write: (chunk) => written.push(chunk),
            end: () => { },
        },
    };
    const systemText = () => {
        const system = captured.system;
        if (Array.isArray(system))
            return String(system[0]?.text ?? '');
        return String(system ?? '');
    };
    return { service, res, written, systemText, model: () => captured.model };
}
const MESSAGES = [{ role: 'user', content: 'draft the handover note' }];
const CONTEXT = 'Workspace: Acme\nYour role: member';
const SKILL_PROMPT = [
    'You are answering as the "Delegate Like Me" skill.',
    '',
    'You hand work off the way I do.',
    '',
    'What this skill has been told before (most recent first) — treat it as',
    'established and do not ask again:',
    '- Hamda owns anything client-facing',
    '',
    'You shape this reply; you do not take actions on your own. If the answer',
    'implies doing something, say what you would do and let the person decide.',
].join('\n');
(0, node_test_1.describe)('§15 a skill reaches the model', () => {
    (0, node_test_1.it)('puts the skill ahead of the generic assistant description', async () => {
        const { service, res, systemText } = captureStream();
        await service.chatStream(MESSAGES, CONTEXT, res, {}, SKILL_PROMPT);
        const system = systemText();
        // First, so nothing below it can quietly override the skill's own wording.
        strict_1.default.ok(system.startsWith('You are answering as the "Delegate Like Me" skill.'), `skill prompt was not first:\n${system.slice(0, 200)}`);
        strict_1.default.match(system, /You hand work off the way I do\./);
        // Memory travels with it, or "never explain it again" is not true.
        strict_1.default.match(system, /Hamda owns anything client-facing/);
        // The boundary survives the assembly.
        strict_1.default.match(system, /do not take actions on your own/);
        // And the workspace grounding is still there — a skill narrows the voice,
        // it does not cost the model its knowledge of the workspace.
        strict_1.default.match(system, /Workspace: Acme/);
    });
    (0, node_test_1.it)('replaces the generic description rather than stacking it', async () => {
        // Both present would give the model two personas and let the generic
        // "be concise, action-oriented" cut across a skill that asked for the
        // opposite.
        const { service, res, systemText } = captureStream();
        await service.chatStream(MESSAGES, CONTEXT, res, {}, SKILL_PROMPT);
        strict_1.default.doesNotMatch(systemText(), /You are Rundesk AI, an intelligent assistant/);
    });
    (0, node_test_1.it)('leaves an ordinary turn exactly as it was', async () => {
        const { service, res, systemText } = captureStream();
        await service.chatStream(MESSAGES, CONTEXT, res, {});
        const system = systemText();
        strict_1.default.match(system, /^You are Rundesk AI, an intelligent assistant embedded in the Rundesk/);
        strict_1.default.match(system, /Workspace context:\nWorkspace: Acme/);
        strict_1.default.doesNotMatch(system, /answering as the/);
    });
    (0, node_test_1.it)('ignores a blank skill prompt instead of shipping an empty persona', async () => {
        const { service, res, systemText } = captureStream();
        await service.chatStream(MESSAGES, CONTEXT, res, {}, '   ');
        strict_1.default.match(systemText(), /^You are Rundesk AI, an intelligent assistant/);
    });
    (0, node_test_1.it)('sends the model the picker chose', async () => {
        // §15 — a picker that does not change the model is worse than no picker,
        // and nothing on screen would show the difference.
        const fast = captureStream();
        await fast.service.chatStream(MESSAGES, CONTEXT, fast.res, {}, undefined, 'fast');
        strict_1.default.equal(fast.model(), 'claude-haiku-4-5');
        const deep = captureStream();
        await deep.service.chatStream(MESSAGES, CONTEXT, deep.res, {}, undefined, 'deep');
        strict_1.default.equal(deep.model(), 'claude-sonnet-4-6');
    });
    (0, node_test_1.it)('keeps the old model when nobody picks one', async () => {
        const { service, res, model } = captureStream();
        await service.chatStream(MESSAGES, CONTEXT, res, {});
        strict_1.default.equal(model(), 'claude-sonnet-4-6', 'adding a picker changed the default answer');
    });
    (0, node_test_1.it)('still streams the answer through', async () => {
        const { service, res, written } = captureStream();
        await service.chatStream(MESSAGES, CONTEXT, res, {}, SKILL_PROMPT);
        strict_1.default.ok(written.some((chunk) => chunk.includes('"delta":"hi"')));
        strict_1.default.ok(written.some((chunk) => chunk.includes('[DONE]')));
    });
});
//# sourceMappingURL=skill-chat.test.js.map