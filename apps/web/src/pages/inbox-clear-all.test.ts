/**
 * §2.5 — Clear all must bin exactly what the Primary chip is showing.
 *
 * This is the one triage action with no undo affordance in reach: cleared rows
 * go to a tab you have to navigate to, and they delete themselves in 30 days.
 * So the set it acts on has to be the set on screen, and the failure is silent
 * in both directions — you cannot watch rows you could not see disappear.
 *
 * It was wrong between the customiser landing and this file existing. The list
 * was filtered by the member's customised `primaryTypes`; the request named the
 * hardcoded HUMAN_TYPES the customiser starts from. Customise Primary down to
 * one kind, click Clear all, and it binned the nine kinds the filter was hiding
 * and left the one kind it was showing. Nothing errored.
 *
 * Written as a tsx-runnable assertion script rather than with `node:test`, for
 * the reason given in ../lib/use-speech-recognition.test.ts: the web tsconfig
 * sets `types: ["vite/client"]`, and pulling in @types/node here would leak Node
 * globals into the whole app's typecheck.
 *
 * Run:  pnpm --filter @rundesk/web test
 */
import { clearAllPayload, matchesInboxFilter, PRIMARY_SELECTABLE_TYPES } from './workspace-inbox-page'

const failures: string[] = []

function expect(cond: boolean, label: string): void {
  if (!cond) failures.push(label)
}
function expectSame(actual: string[] | undefined, expected: string[] | undefined, label: string): void {
  const a = actual === undefined ? 'undefined' : [...actual].sort().join(',')
  const b = expected === undefined ? 'undefined' : [...expected].sort().join(',')
  if (a !== b) failures.push(`${label}: expected [${b}], got [${a}]`)
}

// The All chip narrows nothing, and must not send an empty list — the server
// reads a missing `types` as "the whole bucket", which is what All means.
expectSame(clearAllPayload('all', new Set(['task_mentioned'])).types, undefined, 'All sends no filter')

// The case that was broken: a customised Primary.
const customised = new Set(['task_overdue'])
expectSame(
  clearAllPayload('primary', customised).types,
  ['task_overdue'],
  'Primary sends the customised set, not the default one',
)

// The invariant behind it, stated directly: everything the payload names is on
// screen, and everything on screen is named. Checked across every kind the
// customiser can offer, so adding a type cannot quietly break one direction.
const chosen = new Set(['task_overdue', 'message_reaction', 'access_requested'])
const payload = new Set(clearAllPayload('primary', chosen).types ?? [])
for (const { type } of PRIMARY_SELECTABLE_TYPES) {
  const onScreen = matchesInboxFilter(type, 'primary', chosen)
  expect(
    payload.has(type) === onScreen,
    onScreen
      ? `${type} is shown under Primary but Clear all would leave it`
      : `${type} is hidden by Primary but Clear all would bin it`,
  )
}

// Kinds the customiser offers that the old hardcoded set left out: turning one
// on used to mean Clear all could not touch it.
for (const type of ['message_reaction', 'shared_with_me']) {
  expect(
    new Set(clearAllPayload('primary', new Set([type])).types).has(type),
    `${type} can be turned on, so Clear all must be able to clear it`,
  )
}

// "Show me nothing in Primary" is a choice the customiser allows. The button is
// hidden when nothing is on screen, so this should be unreachable — but if it
// is ever reached it must clear nothing, and an empty list is how you say that.
expectSame(clearAllPayload('primary', new Set()).types, [], 'an empty Primary asks for nothing')

if (failures.length) {
  console.error(`clearAllPayload: ${failures.length} failure(s)`)
  for (const f of failures) console.error(`  - ${f}`)
  throw new Error(`${failures.length} assertion(s) failed`)
}
console.log(`clearAllPayload: all ${PRIMARY_SELECTABLE_TYPES.length + 5} cases passed`)
