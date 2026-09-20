/**
 * §15 — naming a chat from what it is about.
 *
 * Frame `296_1817` shows "New Chat"; by `297_1820` the same thread reads
 * "Skill Definition and Ideas" in the sidebar. The rename is what makes the
 * list usable: five threads called "New Chat" is the same as no list.
 *
 * Pure and DB-free so the rules can be tested without a model — including the
 * one that matters most, which is when NOT to rename.
 */
export declare const DEFAULT_THREAD_TITLE = "New Chat";
/**
 * Whether this thread should be named now.
 *
 * Three conditions, and each exists for a failure that is invisible if you get
 * it wrong. Renaming a thread the person titled themselves loses their words.
 * Renaming after every message makes the sidebar shuffle while they read it.
 * Naming from a single "hi" produces a title about nothing.
 */
export declare function shouldAutoTitle(thread: {
    title: string;
    titleIsAuto: 'yes' | 'no';
    messageCount: number;
}): boolean;
/** Tidy whatever the model returned into something that fits a sidebar row. */
export declare function cleanTitle(raw: string): string;
/**
 * The title used when no model is configured.
 *
 * Not "Chat 4": the first thing someone asked is a better name for a
 * conversation than its position in a list, and it needs no model to produce.
 */
export declare function fallbackTitle(firstUserMessage: string): string;
