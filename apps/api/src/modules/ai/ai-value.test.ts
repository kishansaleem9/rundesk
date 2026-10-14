import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_HOURLY_RATE_CENTS,
  MAX_MINUTES_PER_AGENT_ACTION,
  MAX_MINUTES_PER_RUN,
  formatMinutes,
  summariseAgent,
  summariseValue,
  validateBenchmark,
} from './ai-value'

/**
 * §V2-11 — the arithmetic behind "Time Saved" and "Human Cost Savings".
 *
 * These checks are about honesty rather than about maths. The panel produces a
 * number somebody will put in a business case, so the things worth pinning are:
 * that a losing workspace is shown as losing, that zero states do not render as
 * NaN, and that the benchmark cannot be set to a value that discredits the
 * output.
 */

const BENCH = { minutesSavedPerRun: 6, hourlyRateCents: 5000 }

test('the worked example, end to end', () => {
  // 100 runs × 6 min = 600 min = 10h; 10h × $50 = $500; minus $12 spent.
  const v = summariseValue(100, 12, BENCH)
  assert.equal(v.runs, 100)
  assert.equal(v.minutesSaved, 600)
  assert.equal(v.laborValueUsd, 500)
  assert.equal(v.costUsd, 12)
  assert.equal(v.netValueUsd, 488)
})

test('a workspace that is LOSING is shown as losing', () => {
  // The check this module exists for. Clamping at zero would turn the panel
  // into marketing: expensive usage against an honest benchmark must be able
  // to come out negative, or the number means nothing.
  const v = summariseValue(2, 90, BENCH)
  assert.equal(v.minutesSaved, 12)
  assert.equal(v.laborValueUsd, 10)
  assert.ok(v.netValueUsd < 0, `netValueUsd was ${v.netValueUsd}`)
  assert.equal(v.netValueUsd, -80)
})

test('the benchmark is echoed back, so the surface can show its working', () => {
  // A conclusion without its inputs is a number people cannot argue with, and
  // this one deserves arguing with.
  const v = summariseValue(10, 1, BENCH)
  assert.deepEqual(v.benchmark, BENCH)
})

test('a workspace that has never used AI reads as zero, not as NaN', () => {
  const v = summariseValue(0, 0, BENCH)
  assert.equal(v.runs, 0)
  assert.equal(v.minutesSaved, 0)
  assert.equal(v.laborValueUsd, 0)
  assert.equal(v.netValueUsd, 0)
})

test('a benchmark of zero is a real answer and divides by nothing', () => {
  // "We think a run saves nothing" is a legitimate position, and the panel has
  // to survive it rather than render $NaN.
  const v = summariseValue(100, 5, { minutesSavedPerRun: 0, hourlyRateCents: 0 })
  assert.equal(v.minutesSaved, 0)
  assert.equal(v.laborValueUsd, 0)
  assert.equal(v.netValueUsd, -5)
})

test('nonsense inputs do not become nonsense output', () => {
  const v = summariseValue(Number.NaN, Number.NaN, { minutesSavedPerRun: Number.NaN, hourlyRateCents: Number.NaN })
  assert.equal(v.runs, 0)
  assert.equal(v.laborValueUsd, 0)
  assert.equal(v.netValueUsd, 0)
  assert.ok(!Number.isNaN(v.netValueUsd))
})

test('money is rounded to the cent, not left at float precision', () => {
  // 7 runs × 6 min = 42 min; 42/60 × $33.33 = $23.331
  const v = summariseValue(7, 0, { minutesSavedPerRun: 6, hourlyRateCents: 3333 })
  assert.equal(v.laborValueUsd, 23.33)
})

test('durations read the way somebody would say them', () => {
  assert.equal(formatMinutes(0), '0m')
  assert.equal(formatMinutes(45), '45m')
  assert.equal(formatMinutes(60), '1h')
  assert.equal(formatMinutes(200), '3h 20m')
  // Not "3.33 hours", which is a number nobody says out loud.
  assert.ok(!formatMinutes(200).includes('.'))
  assert.equal(formatMinutes(-5), '0m')
})

test('a benchmark that would discredit the panel is refused', () => {
  assert.equal(validateBenchmark({ minutesSavedPerRun: 6, hourlyRateCents: 5000 }), null)
  assert.ok(validateBenchmark({ minutesSavedPerRun: MAX_MINUTES_PER_RUN + 1 }))
  assert.ok(validateBenchmark({ minutesSavedPerRun: -1 }))
  assert.ok(validateBenchmark({ minutesSavedPerRun: 1.5 }))
  assert.ok(validateBenchmark({ hourlyRateCents: MAX_HOURLY_RATE_CENTS + 1 }))
  assert.ok(validateBenchmark({ hourlyRateCents: -1 }))
})

test('zero is allowed at both ends, because both are real positions', () => {
  assert.equal(validateBenchmark({ minutesSavedPerRun: 0, hourlyRateCents: 0 }), null)
})

test('a partial benchmark validates only what it carries', () => {
  // The surface edits one field at a time; requiring both would make changing
  // the rate also re-assert the minutes.
  assert.equal(validateBenchmark({ hourlyRateCents: 7500 }), null)
  assert.equal(validateBenchmark({}), null)
})

/*
 * MY AGENT PERFORMANCE (`found-14-oct/agent-performance-carried-and-unbuilt`):
 * a row per Super Agent — actions, time saved at the per-action benchmark, the
 * value of that time, the cost of its credits, and the return.
 */
const AGENT_BENCH = { minutesSavedPerAction: 6, hourlyRateCents: 5000 }

test('an agent’s row: actions × minutes, at the hourly rate, over what its credits cost', () => {
  // 5 actions × 6 min = 30 min; ½ h × $50 = $25; 2,000 credits at a tenth of a cent = $2; $25 / $2 = 12.5×.
  const a = summariseAgent(5, 2000, AGENT_BENCH)
  assert.deepEqual(a, { actions: 5, credits: 2000, costUsd: 2, minutesSaved: 30, valueUsd: 25, roi: 12.5 })
})

test('an agent that cost nothing has no return, rather than ∞ or 0', () => {
  assert.equal(summariseAgent(3, 0, AGENT_BENCH).roi, null)
  assert.equal(summariseAgent(0, 0, AGENT_BENCH).roi, null)
})

test('an agent that did nothing saved nothing, and its return says so', () => {
  const a = summariseAgent(0, 500, AGENT_BENCH)
  assert.equal(a.minutesSaved, 0)
  assert.equal(a.valueUsd, 0)
  assert.equal(a.costUsd, 0.5)
  assert.equal(a.roi, 0)
})

test('the return is reckoned from what the credits cost exactly, not from a cost rounded to a cent', () => {
  // 3 credits are $0.003, shown as $0.00; one action is worth $5: 5 / 0.003 = 1666.7×, not a division by zero.
  const a = summariseAgent(1, 3, AGENT_BENCH)
  assert.equal(a.costUsd, 0)
  assert.equal(a.roi, 1666.7)
})

test('nonsense in an agent’s counts or benchmark is nothing, never NaN', () => {
  const a = summariseAgent(Number.NaN, -4, { minutesSavedPerAction: -1, hourlyRateCents: Number.NaN })
  assert.deepEqual(a, { actions: 0, credits: 0, costUsd: 0, minutesSaved: 0, valueUsd: 0, roi: null })
})

test('the minutes per agent action are a whole number from 0 to the ceiling', () => {
  assert.equal(validateBenchmark({ minutesSavedPerAgentAction: 0 }), null)
  assert.equal(validateBenchmark({ minutesSavedPerAgentAction: MAX_MINUTES_PER_AGENT_ACTION }), null)
  assert.match(validateBenchmark({ minutesSavedPerAgentAction: MAX_MINUTES_PER_AGENT_ACTION + 1 }) ?? '', /agent action/)
  assert.match(validateBenchmark({ minutesSavedPerAgentAction: 2.5 }) ?? '', /whole number/)
  assert.match(validateBenchmark({ minutesSavedPerAgentAction: -1 }) ?? '', /agent action/)
})
