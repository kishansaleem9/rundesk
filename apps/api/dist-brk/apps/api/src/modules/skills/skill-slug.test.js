"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const skill_slug_1 = require("./skill-slug");
/**
 * §15 — "The /Slash Command for AI Skills appears for everyone in the
 * Workspace." The command is how a skill is actually reached, so what it
 * resolves to has to be unsurprising.
 */
(0, node_test_1.describe)('§15 a skill’s slash command', () => {
    (0, node_test_1.it)('is the name, typable', () => {
        strict_1.default.equal((0, skill_slug_1.skillSlug)('Personal Task Organizer'), 'personal-task-organizer');
        strict_1.default.equal((0, skill_slug_1.skillSlug)('Brand Voice'), 'brand-voice');
        strict_1.default.equal((0, skill_slug_1.skillSlug)('Triage Tasks Like Me'), 'triage-tasks-like-me');
    });
    (0, node_test_1.it)('survives punctuation, accents and spacing', () => {
        // A command nobody can type on their keyboard is not a command.
        strict_1.default.equal((0, skill_slug_1.skillSlug)('  Résumé   Polisher!  '), 'resume-polisher');
        strict_1.default.equal((0, skill_slug_1.skillSlug)('Q&A / FAQ'), 'q-a-faq');
        strict_1.default.equal((0, skill_slug_1.skillSlug)('Weekly—Review'), 'weekly-review');
    });
    (0, node_test_1.it)('never ends or begins with a separator', () => {
        for (const name of ['---Weird---', '!!!', 'Trailing   ', '  Leading']) {
            const slug = (0, skill_slug_1.skillSlug)(name);
            strict_1.default.doesNotMatch(slug, /^-|-$/, `"${name}" → "${slug}"`);
        }
    });
    (0, node_test_1.it)('stays bounded, and still does not end on a dash after truncation', () => {
        // Slicing mid-word can leave a trailing dash, which would render a command
        // that looks like a typo.
        const slug = (0, skill_slug_1.skillSlug)('A'.repeat(30) + ' ' + 'B'.repeat(30));
        strict_1.default.ok(slug.length <= 40);
        strict_1.default.doesNotMatch(slug, /-$/);
    });
    (0, node_test_1.it)('gives an unnameable skill an empty slug rather than a bare slash', () => {
        // "/" alone would collide with the composer's own command menu.
        strict_1.default.equal((0, skill_slug_1.skillSlug)('!!!'), '');
        strict_1.default.equal((0, skill_slug_1.skillSlug)(''), '');
    });
    (0, node_test_1.it)('knows which commands the composer already owns', () => {
        strict_1.default.ok((0, skill_slug_1.isReservedSlug)('task'));
        strict_1.default.ok((0, skill_slug_1.isReservedSlug)('remind'));
        strict_1.default.ok(!(0, skill_slug_1.isReservedSlug)('brand-voice'));
    });
});
(0, node_test_1.describe)('§15 resolving a typed command', () => {
    const skills = [
        { id: '1', name: 'Brand Voice' },
        { id: '2', name: 'Personal Task Organizer' },
    ];
    (0, node_test_1.it)('finds the one skill meant', () => {
        const r = (0, skill_slug_1.resolveSlug)('brand-voice', skills);
        strict_1.default.equal(r.kind, 'match');
        strict_1.default.equal(r.kind === 'match' && r.skill.id, '1');
    });
    (0, node_test_1.it)('says nothing matched rather than guessing', () => {
        strict_1.default.equal((0, skill_slug_1.resolveSlug)('nope', skills).kind, 'none');
    });
    (0, node_test_1.it)('reports a collision instead of picking by row order', () => {
        // Two names can slug the same — one person's "Brand Voice" and another's
        // "Brand-Voice". Taking the first would make the command mean different
        // things on different days depending on what the database returned first.
        const colliding = [...skills, { id: '3', name: 'Brand-Voice' }];
        const r = (0, skill_slug_1.resolveSlug)('brand-voice', colliding);
        strict_1.default.equal(r.kind, 'ambiguous');
        strict_1.default.deepEqual(r.kind === 'ambiguous' && r.names, ['Brand Voice', 'Brand-Voice']);
    });
    (0, node_test_1.it)('does not match an unnameable skill on an empty command', () => {
        const r = (0, skill_slug_1.resolveSlug)('', [{ id: '9', name: '!!!' }]);
        strict_1.default.equal(r.kind, 'match', 'guard: an empty slug does match an empty slug');
        // …which is why the caller must refuse an empty command before asking.
        strict_1.default.equal((0, skill_slug_1.skillSlug)('!!!'), '');
    });
});
//# sourceMappingURL=skill-slug.test.js.map