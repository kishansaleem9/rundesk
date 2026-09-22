/**
 * §V2-S14b — one React Query key for one endpoint, asserted where it lives.
 *
 * The Planner's Priorities rail and the person panel show the same list. They
 * used to fetch it under two keys — `['person-priorities', ws, user]` and
 * `['planner-priorities', ws, user]` — so a write in one left the other showing
 * a stale list until something else happened to refetch it. `lib/use-priorities`
 * exists to make that impossible: one `usePriorities`, one `prioritiesKey`, one
 * set of mutations.
 *
 * WHY THIS IS A UNIT TEST AND NOT A BROWSER CHECK, which cost two attempts to
 * work out.
 *
 * `planner-priorities.mjs` first claimed to read "the person panel's own query
 * through the app" and called the API directly — a check that could not see a
 * cache at all. It was then rewritten to really open the panel in the same page
 * after writing in the rail, and a break patch giving the panel its own key ran
 * GREEN against it. The reason is the panel's lifecycle, not the key: the panel
 * MOUNTS when it opens, which is after the write, and a `useQuery` whose key
 * holds no data fetches on mount — and with React Query's default
 * `staleTime: 0`, even a populated key refetches on remount. There is no moment
 * at which that screen can show a stale panel.
 *
 * So the shared key is not observable from a browser here. It is a fact about
 * SOURCE, and this is where a fact about source is checked: both call sites
 * must obtain the list from the hook rather than declaring a `useQuery` of
 * their own against the priorities endpoint.
 *
 * Written as a tsx-runnable assertion script rather than with `node:test`, for
 * the reason given in ./use-speech-recognition.test.ts.
 *
 * Run:  pnpm --filter @rundesk/web test
 */
import { readFileSync } from 'node:fs'
import { prioritiesKey } from './use-priorities'

const failures: string[] = []
const expect = (cond: boolean, label: string): void => {
  if (!cond) failures.push(label)
}

const here = new URL('.', import.meta.url).pathname
const read = (rel: string): string => readFileSync(`${here}${rel}`, 'utf8')

/* The key is one definition, and it names the resource rather than a screen. */
const key = prioritiesKey('w1', 'u1') as readonly unknown[]
expect(key.length === 3, `prioritiesKey should be three segments, got ${key.length}`)
expect(key[0] === 'priorities', `the key's head should be 'priorities', got ${String(key[0])}`)
expect(key[1] === 'w1' && key[2] === 'u1', 'the key should carry the workspace and the person')
/*
 * No screen name in it. A key that says WHICH SURFACE is asking is the bug this
 * file exists to prevent, wearing one extra segment.
 */
expect(
  !key.some((seg) => typeof seg === 'string' && /planner|person|rail|panel/i.test(seg)),
  `the key names a surface: ${JSON.stringify(key)}`,
)

/*
 * And both surfaces go through the hook.
 *
 * A source assertion, deliberately. The property is "there is one reader", and
 * a second reader is a thing you can only see by looking at whether one was
 * written. Matched on the endpoint rather than on `useQuery`, because both
 * files legitimately hold other queries.
 */
const CALL_SITES = [
  ['../components/person-panel.tsx', 'the person panel'],
  ['../pages/workspace-planner-page.tsx', "the Planner's rail"],
] as const
for (const [rel, what] of CALL_SITES) {
  const src = read(rel)
  expect(
    src.includes('usePriorities('),
    `${what} should read the list through usePriorities()`,
  )
  expect(
    !/queryKey:\s*\[\s*['"][^'"]*priorit/i.test(src),
    `${what} declares its own priorities queryKey — that is the two-key bug returning`,
  )
  expect(
    !/people\/\$\{[^}]*\}\/priorities/.test(src.replace(/usePriorities\([^)]*\)/g, '')),
    `${what} fetches the priorities endpoint itself instead of using the hook`,
  )
}

if (failures.length) {
  console.error(`use-priorities: ${failures.length} failure(s)`)
  for (const f of failures) console.error(`  - ${f}`)
  throw new Error(`${failures.length} assertion(s) failed`)
}
console.log('use-priorities: one key, named for the resource, and both surfaces read through it')
