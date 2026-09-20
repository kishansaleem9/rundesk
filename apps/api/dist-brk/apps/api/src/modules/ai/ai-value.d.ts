/**
 * §V2-11 — turning AI usage into what it was worth.
 *
 * Frames `19:00`/`19:05` put **Time Saved** and **Human Cost Savings** beside
 * spend, at an editable $/hour, with an explicit **Edit benchmark** control.
 * Rundesk's existing usage panel (`AiUsageTab`, §A4.4) answers "what did this
 * cost". The question somebody renewing a subscription actually asks is what it
 * was worth, and nothing in the product answered it.
 *
 * THIS FILE IS SEPARATE, AND PURE, BECAUSE IT IS THE PART THAT CAN LIE.
 * Everything here is an ESTIMATE built on a benchmark somebody chose, and an
 * estimate presented as a measurement is worse than no number at all — it is a
 * number people will quote. Keeping the arithmetic in one pure function means
 * it can be tested against its own edge cases, and means the surface can show
 * the working rather than just the conclusion.
 *
 * THE UNIT IS A RUN, NOT AN "ACTION". One row in `ai_usage` is one call to the
 * model. A single thing a person did can be several runs, so calling runs
 * "actions" would inflate the saving in a way nobody could see from the screen.
 * The word "runs" is used throughout, including in what is returned, so the
 * surface cannot quietly rename it.
 */
/** What the workspace has decided one AI run is worth in human time and money. */
export type ValueBenchmark = {
    /** Minutes of human work one run is taken to replace. */
    minutesSavedPerRun: number;
    /** In cents, so the rate never rounds through a float on its way to a total. */
    hourlyRateCents: number;
};
export type ValueSummary = {
    runs: number;
    /** What those runs cost to make, in USD. */
    costUsd: number;
    /** The benchmark this was reasoned from, echoed so the surface can show it. */
    benchmark: ValueBenchmark;
    minutesSaved: number;
    /** minutesSaved / 60 × the hourly rate. */
    laborValueUsd: number;
    /**
     * `laborValueUsd - costUsd`. NEGATIVE IS A REAL AND IMPORTANT ANSWER: a
     * workspace whose benchmark is honest and whose usage is expensive should see
     * that it is losing, and clamping this at zero would turn the panel into
     * marketing.
     */
    netValueUsd: number;
};
/**
 * Worth, from runs and a benchmark.
 *
 * Deliberately total: zero runs, a zero benchmark and a zero rate are all
 * ordinary states — a workspace that has never used AI, or one that has decided
 * a run saves nothing — and each returns zero rather than a division by zero or
 * a NaN that renders as "$NaN".
 */
export declare function summariseValue(runs: number, costUsd: number, benchmark: ValueBenchmark): ValueSummary;
/**
 * "3h 20m", "45m", "0m" — how a saving is read aloud.
 *
 * Hours and minutes rather than decimal hours: "3.33 hours" is a number nobody
 * says, and the panel is meant to be quoted in a conversation about renewing.
 */
export declare function formatMinutes(totalMinutes: number): string;
/** The ceilings the database also enforces, shared so the API refuses first. */
export declare const MAX_MINUTES_PER_RUN = 480;
export declare const MAX_HOURLY_RATE_CENTS = 10000000;
/**
 * Is this a benchmark a workspace may set?
 *
 * Bounded at both ends because the output is a number people will put in a
 * business case. Eight hours saved per model call, or a $100,000/hour rate,
 * produce a figure that discredits the panel rather than one that is merely
 * wrong.
 */
export declare function validateBenchmark(patch: Partial<ValueBenchmark>): string | null;
