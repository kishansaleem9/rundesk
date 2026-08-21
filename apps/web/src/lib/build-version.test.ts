/**
 * §0 — deciding that the app you are running is out of date.
 *
 * The stakes are lopsided. Missing an update leaves someone on an older build
 * for a while, which is what happened on 21 Aug 2026 and is bad. Reporting an
 * update that isn't there is worse: `reloadOntoCurrentBuild` unregisters the
 * worker, drops every cache and reloads, so a false positive on a flaky
 * connection is an app that throws itself away in a loop and never comes back.
 *
 * So every unusable answer has to read as "current", never as "stale". The
 * cases below are the ways an answer can be unusable, and they are the reason
 * this logic is a pure function taking `fetch` rather than something only an
 * end-to-end test could reach.
 *
 * Run:  pnpm --filter @rundesk/web test
 */
import { fetchServerBuildId, isStale, RUNNING_BUILD_ID } from './build-version'

const failures: string[] = []
const expect = (cond: boolean, label: string): void => {
  if (!cond) failures.push(label)
}

/** A fetch that answers once, however we like. */
const answering = (
  body: unknown,
  { ok = true, throws = false }: { ok?: boolean; throws?: boolean } = {},
): typeof fetch =>
  (async () => {
    if (throws) throw new Error('network down')
    return {
      ok,
      json: async () => {
        if (typeof body === 'symbol') throw new Error('not json')
        return body
      },
    } as Response
  }) as unknown as typeof fetch

const run = async () => {
  // --- reading the answer -------------------------------------------------
  expect(
    (await fetchServerBuildId(answering({ buildId: 'abc' }))) === 'abc',
    'reads the build id the server reports',
  )
  expect(
    (await fetchServerBuildId(answering({ buildId: 'abc' }, { ok: false }))) === null,
    'a non-200 is not an answer',
  )
  expect(
    (await fetchServerBuildId(answering(null, { throws: true }))) === null,
    'a network failure is not an answer',
  )
  expect(
    (await fetchServerBuildId(answering(Symbol('html') as unknown))) === null,
    'a body that will not parse is not an answer',
  )
  expect(
    (await fetchServerBuildId(answering({}))) === null,
    'a JSON body with no buildId is not an answer',
  )
  expect(
    (await fetchServerBuildId(answering({ buildId: '' }))) === null,
    'an empty buildId is not an answer',
  )
  expect(
    (await fetchServerBuildId(answering({ buildId: 42 }))) === null,
    'a non-string buildId is not an answer',
  )

  // --- what it does with the answer ---------------------------------------
  // Unstamped bundles are dev servers and test runs. Calling those stale would
  // put the pill on screen on every save.
  expect(RUNNING_BUILD_ID === 'dev', 'an unstamped bundle identifies as dev')
  expect(
    (await isStale(answering({ buildId: 'something-else' }))) === false,
    'a dev bundle is never stale, whatever the server says',
  )

  // Every unusable answer must land on "current" — see the header.
  for (const [label, f] of [
    ['offline', answering(null, { throws: true })],
    ['a 502 HTML error page', answering(Symbol('html') as unknown, { ok: false })],
    ['a body with no buildId', answering({})],
  ] as Array<[string, typeof fetch]>) {
    expect((await isStale(f)) === false, `${label} does not trigger a reload`)
  }
}

await run()

if (failures.length) {
  console.error(`build-version: ${failures.length} failure(s)`)
  for (const f of failures) console.error(`  - ${f}`)
  throw new Error(`${failures.length} assertion(s) failed`)
}
console.log('build-version: all 12 cases passed')
