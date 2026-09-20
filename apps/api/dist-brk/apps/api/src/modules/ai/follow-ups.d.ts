/**
 * G13-9 [18:42] — "Follow ups", under every answer.
 *
 * > Under every assistant answer, a "Follow ups" label and clickable next-step
 * > chips generated from that answer. She drives the whole demo by clicking
 * > one.
 *
 * Ours were a fixed five-item menu rendered only when `messages.length === 0`,
 * so after the first reply the user was on their own and the guided path that
 * makes Skills discoverable did not exist.
 *
 * ## Why a marker in the same completion, and not a second call
 *
 * The obvious implementation is a small follow-up model call once the answer
 * is done. It is also a second billed request on **every turn**, forever, for
 * three lines of text — and this product is sold to an agency watching its AI
 * spend. So the answer carries its own follow-ups after a marker, and the
 * server strips them off the stream.
 *
 * That trade buys a real problem: the marker arrives in arbitrary chunks, and
 * a naive `indexOf` per chunk leaks `<<<FOLLOW` to the reader when the split
 * lands mid-marker. Hence the splitter below, which holds back exactly the
 * suffix that could still become the marker and nothing more — so text is
 * never delayed by more than a few characters, and a partial marker is never
 * shown.
 */
/**
 * Deliberately not a natural phrase and not valid Markdown, so a model writing
 * ordinary prose has no reason to produce it and a user reading the answer
 * would never have typed it.
 */
export declare const FOLLOW_UP_MARKER = "<<<FOLLOW_UPS>>>";
/** How many the panel shows. More than three is a menu, not a next step. */
export declare const MAX_FOLLOW_UPS = 3;
/**
 * The instruction appended to the system prompt.
 *
 * Phrased so that omitting the block is acceptable: a model that answers a
 * yes/no question has no useful next step, and inventing one to satisfy a
 * format is worse than leaving the chips off.
 */
export declare const FOLLOW_UP_INSTRUCTION = "When \u2014 and only when \u2014 there is a genuinely useful next step the person could take, end your reply with a line containing exactly <<<FOLLOW_UPS>>> and then up to 3 suggestions, one per line, each starting with \"- \".\n\nEach suggestion must be a complete instruction the person could send back to you as their next message, phrased in their voice (\"Draft the handover note for me\"), under 60 characters, and specific to what you just said. Do not add the block at all if the answer does not lead anywhere.";
/**
 * Splits a stream of text deltas into visible answer text and the follow-up
 * block hiding behind the marker.
 *
 * Stateful across calls, because the marker can straddle any chunk boundary.
 */
export declare function createFollowUpSplitter(): {
    /** Visible text for this delta — possibly empty, never a partial marker. */
    push(delta: string): string;
    /**
     * Anything still held back when the stream ends was never a marker, so it
     * belongs to the answer. Without this, a reply ending in "<" loses it.
     */
    flush(): string;
    /** The suggestions, cleaned up. Empty when the model offered none. */
    followUps(): string[];
};
/**
 * The block's lines, as suggestions.
 *
 * Tolerant on the way in — models vary on bullet character and spacing — and
 * strict on the way out: anything empty, absurdly long, or beyond the third is
 * dropped rather than rendered as a chip nobody would click.
 */
export declare function parseFollowUps(block: string): string[];
