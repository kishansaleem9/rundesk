"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_HOURLY_RATE_CENTS = exports.MAX_MINUTES_PER_RUN = void 0;
exports.summariseValue = summariseValue;
exports.formatMinutes = formatMinutes;
exports.validateBenchmark = validateBenchmark;
/** Two decimal places, the way money is read. */
const money = (n) => Math.round(n * 100) / 100;
/**
 * Worth, from runs and a benchmark.
 *
 * Deliberately total: zero runs, a zero benchmark and a zero rate are all
 * ordinary states — a workspace that has never used AI, or one that has decided
 * a run saves nothing — and each returns zero rather than a division by zero or
 * a NaN that renders as "$NaN".
 */
function summariseValue(runs, costUsd, benchmark) {
    const safeRuns = Number.isFinite(runs) && runs > 0 ? Math.floor(runs) : 0;
    const perRun = Number.isFinite(benchmark.minutesSavedPerRun) && benchmark.minutesSavedPerRun > 0
        ? benchmark.minutesSavedPerRun
        : 0;
    const rateCents = Number.isFinite(benchmark.hourlyRateCents) && benchmark.hourlyRateCents > 0
        ? benchmark.hourlyRateCents
        : 0;
    const minutesSaved = safeRuns * perRun;
    const laborValueUsd = money((minutesSaved / 60) * (rateCents / 100));
    const spend = Number.isFinite(costUsd) && costUsd > 0 ? money(costUsd) : 0;
    return {
        runs: safeRuns,
        costUsd: spend,
        benchmark: { minutesSavedPerRun: perRun, hourlyRateCents: rateCents },
        minutesSaved,
        laborValueUsd,
        netValueUsd: money(laborValueUsd - spend),
    };
}
/**
 * "3h 20m", "45m", "0m" — how a saving is read aloud.
 *
 * Hours and minutes rather than decimal hours: "3.33 hours" is a number nobody
 * says, and the panel is meant to be quoted in a conversation about renewing.
 */
function formatMinutes(totalMinutes) {
    const whole = Number.isFinite(totalMinutes) && totalMinutes > 0 ? Math.floor(totalMinutes) : 0;
    const hours = Math.floor(whole / 60);
    const minutes = whole % 60;
    if (hours === 0)
        return `${minutes}m`;
    if (minutes === 0)
        return `${hours}h`;
    return `${hours}h ${minutes}m`;
}
/** The ceilings the database also enforces, shared so the API refuses first. */
exports.MAX_MINUTES_PER_RUN = 480;
exports.MAX_HOURLY_RATE_CENTS = 10_000_000;
/**
 * Is this a benchmark a workspace may set?
 *
 * Bounded at both ends because the output is a number people will put in a
 * business case. Eight hours saved per model call, or a $100,000/hour rate,
 * produce a figure that discredits the panel rather than one that is merely
 * wrong.
 */
function validateBenchmark(patch) {
    const { minutesSavedPerRun, hourlyRateCents } = patch;
    if (minutesSavedPerRun !== undefined) {
        if (!Number.isInteger(minutesSavedPerRun) || minutesSavedPerRun < 0 || minutesSavedPerRun > exports.MAX_MINUTES_PER_RUN) {
            return `Minutes saved per run must be a whole number between 0 and ${exports.MAX_MINUTES_PER_RUN}`;
        }
    }
    if (hourlyRateCents !== undefined) {
        if (!Number.isInteger(hourlyRateCents) || hourlyRateCents < 0 || hourlyRateCents > exports.MAX_HOURLY_RATE_CENTS) {
            return 'That hourly rate is outside the range this benchmark accepts';
        }
    }
    return null;
}
//# sourceMappingURL=ai-value.js.map