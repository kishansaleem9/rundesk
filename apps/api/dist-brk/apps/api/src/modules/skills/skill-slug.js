"use strict";
/**
 * §15 — a skill's slash command.
 *
 * ClickUp: "The /Slash Command for AI Skills appears for everyone in the
 * Workspace." That is the primary way a skill is used — you type it where you
 * are working, not from a settings page.
 *
 * The slug is DERIVED from the name rather than stored. Storing one would make
 * the command stable across a rename, which sounds better until you consider
 * what a person actually does: they rename "Brand Voice" to "Client Voice" and
 * then type `/client-voice`, because that is what the skill is called now. A
 * derived slug follows the name, which is the behaviour that needs no
 * explaining. The cost is that renaming breaks a memorised command — visible
 * and immediate, unlike a stored slug silently disagreeing with the label.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESERVED_SLASH_COMMANDS = void 0;
exports.skillSlug = skillSlug;
exports.isReservedSlug = isReservedSlug;
exports.resolveSlug = resolveSlug;
/** Reserved by the chat composer itself; a skill may not shadow one. */
exports.RESERVED_SLASH_COMMANDS = ['task', 'remind'];
function skillSlug(name) {
    return (name
        .normalize('NFKD')
        // Strip combining marks so "Résumé" and "Resume" reach the same command
        // rather than one of them being untypable on a US keyboard.
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
        .replace(/-+$/, ''));
}
function isReservedSlug(slug) {
    return exports.RESERVED_SLASH_COMMANDS.includes(slug);
}
function resolveSlug(slug, candidates) {
    const hits = candidates.filter((c) => skillSlug(c.name) === slug);
    if (hits.length === 0)
        return { kind: 'none' };
    if (hits.length > 1)
        return { kind: 'ambiguous', names: hits.map((h) => h.name) };
    return { kind: 'match', skill: hits[0] };
}
//# sourceMappingURL=skill-slug.js.map