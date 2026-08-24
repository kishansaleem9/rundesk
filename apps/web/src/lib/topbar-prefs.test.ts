/**
 * §6 — resolving which tools sit in the top bar.
 *
 * `topbarHidden` and `topbarPinned` are opposites, so this could never be a
 * rename: the old column said what to take away and everything absent was
 * shown; the new one says what to show and everything absent is not. Read one
 * as the other and a member's bar either empties or fills with the five things
 * they had already put away — silently, on their next login, with nothing to
 * explain it.
 *
 * That is the whole reason NULL is meaningful here, and these cases are the
 * reason to trust it.
 *
 * Run:  pnpm --filter @rundesk/web test
 */
import { resolvePinned, TOPBAR_ITEMS } from './topbar-prefs'

const failures: string[] = []
const expect = (cond: boolean, label: string): void => {
  if (!cond) failures.push(label)
}
const same = (actual: Set<string>, expected: string[], label: string): void => {
  const a = [...actual].sort().join(',')
  const b = [...expected].sort().join(',')
  if (a !== b) failures.push(`${label}: expected [${b}], got [${a}]`)
}

// --- a member who has chosen -------------------------------------------------
same(resolvePinned(['docs', 'timer'], null), ['docs', 'timer'], 'an explicit choice is honoured')

// Pinning nothing is a decision, not an absence. Falling back to a default here
// would quietly overrule someone who cleared their bar on purpose.
same(resolvePinned([], null), [], 'pinning nothing stays nothing')

// Even with an old hidden-list still on the row, the newer column wins.
same(
  resolvePinned(['docs'], ['notifications']),
  ['docs'],
  'an explicit choice beats the legacy column',
)

// --- a member migrating from the old model ----------------------------------
// The default row was ['notifications'] — bell away, the other four shown. That
// bar has to survive the change untouched.
same(
  resolvePinned(null, ['notifications']),
  ['theme', 'timer', 'ai', 'create'],
  'the old default migrates to the same bar',
)

// Someone who had put several away keeps them away.
same(
  resolvePinned(null, ['notifications', 'ai', 'theme']),
  ['timer', 'create'],
  'a customised hidden-list migrates faithfully',
)

// And someone who had hidden nothing keeps all five.
same(
  resolvePinned(null, []),
  ['notifications', 'theme', 'timer', 'ai', 'create'],
  'hiding nothing migrates to all five',
)

// The migration must never invent tools that did not exist under the old model
// — that is precisely the "five new icons appear unbidden" failure.
for (const [pinned, hidden] of [
  [null, ['notifications']],
  [null, []],
  [null, ['ai']],
] as Array<[null, string[]]>) {
  const got = resolvePinned(pinned, hidden)
  for (const tool of ['docs', 'clips', 'recordings', 'whiteboards', 'dashboards']) {
    expect(!got.has(tool as never), `${tool} appeared in a migrated bar without being chosen`)
  }
}

// --- a member who has never touched either ----------------------------------
const fresh = resolvePinned(null, null)
expect(fresh.size > 0, 'a new member gets something in the bar')
expect(fresh.size <= 4, `a new member is not handed a full bar (${fresh.size} pinned)`)
expect(!fresh.has('notifications'), 'the bell still starts off — §1.5 "[Default par]"')

// --- junk from the wire ------------------------------------------------------
same(resolvePinned(['docs', 'not-a-tool', 42], null), ['docs'], 'unknown entries are dropped')
same(resolvePinned('docs', null), [...resolvePinned(null, null)], 'a non-array is not a choice')
same(resolvePinned(null, 'notifications'), [...resolvePinned(null, null)], 'a non-array legacy value is ignored')

// --- the catalogue -----------------------------------------------------------
for (const tool of ['docs', 'clips', 'recordings', 'whiteboards', 'dashboards']) {
  expect(
    (TOPBAR_ITEMS as readonly string[]).includes(tool),
    `${tool} is not offered, but she names it at [07:58]`,
  )
}

if (failures.length) {
  console.error(`topbar-prefs: ${failures.length} failure(s)`)
  for (const f of failures) console.error(`  - ${f}`)
  throw new Error(`${failures.length} assertion(s) failed`)
}
console.log(`topbar-prefs: all ${13 + 5} cases passed`)
