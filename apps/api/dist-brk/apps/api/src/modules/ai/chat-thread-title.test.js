"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const chat_thread_title_1 = require("./chat-thread-title");
/**
 * §15 — "New Chat" → "Skill Definition and Ideas" (frames `296_1817`,
 * `297_1820`). The rename is what makes the sidebar list usable; five threads
 * called "New Chat" is the same as no list at all.
 */
const thread = (over = {}) => ({
    title: chat_thread_title_1.DEFAULT_THREAD_TITLE,
    titleIsAuto: 'yes',
    messageCount: 2,
    ...over,
});
(0, node_test_1.describe)('§15 when a chat gets named', () => {
    (0, node_test_1.it)('names it once there is an exchange to name', () => {
        strict_1.default.ok((0, chat_thread_title_1.shouldAutoTitle)(thread()));
    });
    (0, node_test_1.it)('waits for an answer rather than naming from the question alone', () => {
        strict_1.default.ok(!(0, chat_thread_title_1.shouldAutoTitle)(thread({ messageCount: 1 })));
        strict_1.default.ok(!(0, chat_thread_title_1.shouldAutoTitle)(thread({ messageCount: 0 })));
    });
    (0, node_test_1.it)('never renames a thread its owner titled', () => {
        // The one that actually loses something: a person names a thread, keeps
        // talking, and the model quietly replaces their words.
        strict_1.default.ok(!(0, chat_thread_title_1.shouldAutoTitle)(thread({ titleIsAuto: 'no' })));
        strict_1.default.ok(!(0, chat_thread_title_1.shouldAutoTitle)(thread({ titleIsAuto: 'no', title: 'My planning notes' })));
    });
    (0, node_test_1.it)('does not rename a thread that already has an automatic name', () => {
        // Otherwise the sidebar reshuffles under someone reading it, and the title
        // drifts with every message.
        strict_1.default.ok(!(0, chat_thread_title_1.shouldAutoTitle)(thread({ title: 'Skill Definition and Ideas' })));
    });
    (0, node_test_1.it)('stays quiet on a long thread that was already named', () => {
        strict_1.default.ok(!(0, chat_thread_title_1.shouldAutoTitle)(thread({ title: 'Sprint planning', messageCount: 40 })));
    });
});
(0, node_test_1.describe)('§15 tidying a generated title', () => {
    (0, node_test_1.it)('unwraps the quotes models like to add', () => {
        strict_1.default.equal((0, chat_thread_title_1.cleanTitle)('"Skill Definition and Ideas"'), 'Skill Definition and Ideas');
        strict_1.default.equal((0, chat_thread_title_1.cleanTitle)("'Weekly Review'"), 'Weekly Review');
        strict_1.default.equal((0, chat_thread_title_1.cleanTitle)('`Brand Voice`'), 'Brand Voice');
    });
    (0, node_test_1.it)('drops a trailing period, which reads as a cut-off sentence', () => {
        strict_1.default.equal((0, chat_thread_title_1.cleanTitle)('Skill Definition and Ideas.'), 'Skill Definition and Ideas');
    });
    (0, node_test_1.it)('collapses whitespace', () => {
        strict_1.default.equal((0, chat_thread_title_1.cleanTitle)('  Skill   Definition  '), 'Skill Definition');
    });
    (0, node_test_1.it)('truncates rather than letting a row grow', () => {
        const long = (0, chat_thread_title_1.cleanTitle)('word '.repeat(40));
        strict_1.default.ok(long.length <= 60, `${long.length} chars`);
        strict_1.default.ok(long.endsWith('…'));
    });
    (0, node_test_1.it)('returns empty for nothing usable, so the caller can keep the default', () => {
        strict_1.default.equal((0, chat_thread_title_1.cleanTitle)('   '), '');
        strict_1.default.equal((0, chat_thread_title_1.cleanTitle)('""'), '');
    });
});
(0, node_test_1.describe)('§15 naming without a model', () => {
    (0, node_test_1.it)('uses what they actually asked', () => {
        // Better than "Chat 4": the first thing someone asked is a real name for
        // the conversation, and needs no model to produce.
        strict_1.default.equal((0, chat_thread_title_1.fallbackTitle)('Help me create a skill for triaging inbound bugs'), 'Create a skill for triaging inbound bugs');
    });
    (0, node_test_1.it)('strips the throat-clearing so the title is about the subject', () => {
        // Two openers stacked. Stripping only the first leaves "Help me plan the
        // sprint" — a title about asking rather than about the sprint.
        strict_1.default.equal((0, chat_thread_title_1.fallbackTitle)('can you help me plan the sprint'), 'Plan the sprint');
        strict_1.default.equal((0, chat_thread_title_1.fallbackTitle)('Hi, could you please draft the update'), 'Draft the update');
        strict_1.default.equal((0, chat_thread_title_1.fallbackTitle)('Hey, summarise the release notes'), 'Summarise the release notes');
    });
    (0, node_test_1.it)('capitalises, so it does not read as a fragment', () => {
        strict_1.default.match((0, chat_thread_title_1.fallbackTitle)('draft the client update'), /^Draft/);
    });
    (0, node_test_1.it)('keeps the default when there is nothing to name it after', () => {
        strict_1.default.equal((0, chat_thread_title_1.fallbackTitle)('   '), chat_thread_title_1.DEFAULT_THREAD_TITLE);
        strict_1.default.equal((0, chat_thread_title_1.fallbackTitle)(''), chat_thread_title_1.DEFAULT_THREAD_TITLE);
    });
});
//# sourceMappingURL=chat-thread-title.test.js.map