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
  minutesSavedPerRun: number
  /** In cents, so the rate never rounds through a float on its way to a total. */
  hourlyRateCents: number
}

export type ValueSummary = {
  runs: number
  /** What those runs cost to make, in USD. */
  costUsd: number
  /** The benchmark this was reasoned from, echoed so the surface can show it. */
  benchmark: ValueBenchmark
  minutesSaved: number
  /** minutesSaved / 60 × the hourly rate. */
  laborValueUsd: number
  /**
   * `laborValueUsd - costUsd`. NEGATIVE IS A REAL AND IMPORTANT ANSWER: a
   * workspace whose benchmark is honest and whose usage is expensive should see
   * that it is losing, and clamping this at zero would turn the panel into
   * marketing.
   */
  netValueUsd: number
}

/** Two decimal places, the way money is read. */
const money = (n: number) => Math.round(n * 100) / 100

/**
 * Worth, from runs and a benchmark.
 *
 * Deliberately total: zero runs, a zero benchmark and a zero rate are all
 * ordinary states — a workspace that has never used AI, or one that has decided
 * a run saves nothing — and each returns zero rather than a division by zero or
 * a NaN that renders as "$NaN".
 */
export function summariseValue(
  runs: number,
  costUsd: number,
  benchmark: ValueBenchmark,
): ValueSummary {
  const safeRuns = Number.isFinite(runs) && runs > 0 ? Math.floor(runs) : 0
  const perRun = Number.isFinite(benchmark.minutesSavedPerRun) && benchmark.minutesSavedPerRun > 0
    ? benchmark.minutesSavedPerRun
    : 0
  const rateCents = Number.isFinite(benchmark.hourlyRateCents) && benchmark.hourlyRateCents > 0
    ? benchmark.hourlyRateCents
    : 0

  const minutesSaved = safeRuns * perRun
  const laborValueUsd = money((minutesSaved / 60) * (rateCents / 100))
  const spend = Number.isFinite(costUsd) && costUsd > 0 ? money(costUsd) : 0

  return {
    runs: safeRuns,
    costUsd: spend,
    benchmark: { minutesSavedPerRun: perRun, hourlyRateCents: rateCents },
    minutesSaved,
    laborValueUsd,
    netValueUsd: money(laborValueUsd - spend),
  }
}

/**
 * "3h 20m", "45m", "0m" — how a saving is read aloud.
 *
 * Hours and minutes rather than decimal hours: "3.33 hours" is a number nobody
 * says, and the panel is meant to be quoted in a conversation about renewing.
 */
export function formatMinutes(totalMinutes: number): string {
  const whole = Number.isFinite(totalMinutes) && totalMinutes > 0 ? Math.floor(totalMinutes) : 0
  const hours = Math.floor(whole / 60)
  const minutes = whole % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

/** The ceilings the database also enforces, shared so the API refuses first. */
export const MAX_MINUTES_PER_RUN = 480
export const MAX_HOURLY_RATE_CENTS = 10_000_000
export const MAX_MINUTES_PER_AGENT_ACTION = 480

/** USD per AI credit: a tenth of a cent, ClickUp's price (`credits.ts`), here so this file stays pure. */
const USD_PER_CREDIT = 0.001

/**
 * ONE ROW OF MY AGENT PERFORMANCE, as ClickUp's table has it
 * (`found-14-oct/agent-performance-carried-and-unbuilt`): the actions a Super
 * Agent completed, the time they saved at the per-action benchmark, what that
 * time was worth at the hourly rate, what the agent cost in credits, and the
 * return — value over cost.
 *
 * AN ACTION, NOT A RUN: a run is one turn of the agent, an action one thing it
 * carried out in it — a task made, a field set — so the saving is counted in
 * what it did. A run that did nothing saved nothing.
 */
export type AgentBenchmark = {
  /** Minutes of human work one completed action is taken to replace. */
  minutesSavedPerAction: number
  hourlyRateCents: number
}

export type AgentPerformance = {
  actions: number
  credits: number
  /** What its credits cost, in USD. */
  costUsd: number
  minutesSaved: number
  /** minutesSaved / 60 × the hourly rate, in USD. */
  valueUsd: number
  /**
   * Value over cost, to one decimal place: `12.5` is "12.5×". NOTHING where it
   * cost nothing — a return on no spend is not a number, and printing ∞ or 0
   * would each say something false.
   */
  roi: number | null
}

export function summariseAgent(actions: number, credits: number, benchmark: AgentBenchmark): AgentPerformance {
  const safeActions = Number.isFinite(actions) && actions > 0 ? Math.floor(actions) : 0
  const safeCredits = Number.isFinite(credits) && credits > 0 ? Math.floor(credits) : 0
  const perAction = Number.isFinite(benchmark.minutesSavedPerAction) && benchmark.minutesSavedPerAction > 0
    ? benchmark.minutesSavedPerAction
    : 0
  const rateCents = Number.isFinite(benchmark.hourlyRateCents) && benchmark.hourlyRateCents > 0
    ? benchmark.hourlyRateCents
    : 0
  const minutesSaved = safeActions * perAction
  const valueUsd = money((minutesSaved / 60) * (rateCents / 100))
  // The return is reckoned from what the credits cost exactly, not from the cost rounded to a cent.
  const exactCost = safeCredits * USD_PER_CREDIT
  return {
    actions: safeActions,
    credits: safeCredits,
    costUsd: money(exactCost),
    minutesSaved,
    valueUsd,
    roi: exactCost > 0 ? Math.round((valueUsd / exactCost) * 10) / 10 : null,
  }
}

/**
 * Is this a benchmark a workspace may set?
 *
 * Bounded at both ends because the output is a number people will put in a
 * business case. Eight hours saved per model call, or a $100,000/hour rate,
 * produce a figure that discredits the panel rather than one that is merely
 * wrong.
 */
export function validateBenchmark(patch: Partial<ValueBenchmark> & { minutesSavedPerAgentAction?: number }): string | null {
  const { minutesSavedPerRun, hourlyRateCents, minutesSavedPerAgentAction } = patch
  if (minutesSavedPerRun !== undefined) {
    if (!Number.isInteger(minutesSavedPerRun) || minutesSavedPerRun < 0 || minutesSavedPerRun > MAX_MINUTES_PER_RUN) {
      return `Minutes saved per run must be a whole number between 0 and ${MAX_MINUTES_PER_RUN}`
    }
  }
  if (hourlyRateCents !== undefined) {
    if (!Number.isInteger(hourlyRateCents) || hourlyRateCents < 0 || hourlyRateCents > MAX_HOURLY_RATE_CENTS) {
      return 'That hourly rate is outside the range this benchmark accepts'
    }
  }
  if (minutesSavedPerAgentAction !== undefined) {
    if (!Number.isInteger(minutesSavedPerAgentAction) || minutesSavedPerAgentAction < 0 || minutesSavedPerAgentAction > MAX_MINUTES_PER_AGENT_ACTION) {
      return `Minutes saved per agent action must be a whole number between 0 and ${MAX_MINUTES_PER_AGENT_ACTION}`
    }
  }
  return null
}
