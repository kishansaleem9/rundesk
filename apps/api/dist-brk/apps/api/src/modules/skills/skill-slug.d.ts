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
/** Reserved by the chat composer itself; a skill may not shadow one. */
export declare const RESERVED_SLASH_COMMANDS: readonly ["task", "remind"];
export declare function skillSlug(name: string): string;
export declare function isReservedSlug(slug: string): boolean;
/**
 * Find the one skill a typed command means.
 *
 * Names are unique per person, but slugs are not: "Brand Voice" and
 * "Brand-Voice" collapse to the same command, and two colleagues' published
 * skills can collide outright. Returning the first match would make `/brand`
 * mean different things depending on row order, so an ambiguous command is
 * reported as ambiguous and the person is told which names collided.
 */
export type SlugResolution<T> = {
    kind: 'match';
    skill: T;
} | {
    kind: 'none';
} | {
    kind: 'ambiguous';
    names: string[];
};
export declare function resolveSlug<T extends {
    name: string;
}>(slug: string, candidates: T[]): SlugResolution<T>;
