/**
 * §V2-06 — "Create a Space" asks something now.
 *
 * `[06:39]`–`[07:24]`: name, description ("aap pe depend karta hai"), Make
 * Private, Continue → "kis PURPOSE ke liye chahiye", then default view and
 * ClickApps. Frames `06:52` (Default permission · Make Private) and `07:06`
 * (four workflow presets, each expanding into Default views, Task statuses and
 * ClickApps).
 *
 * THE CHECK THAT IS THE WHOLE POINT.
 *
 * `[07:46]` — "Ab space ke baad jo hai, yeh LIST automatically generate kar
 * deta hai ClickUp … us base pe jo aap ne ooper di ho." A wizard that collects
 * a purpose and then drops you into an empty space has asked a question for
 * nothing. So the load-bearing assertion here is not that the preset was
 * STORED — it is that the space came out with the preset's statuses and its
 * lists actually in it.
 *
 * And the one before it: `POST /spaces` has accepted `description`, `color` and
 * `icon` since it was written, and BOTH web call sites sent `{workspaceId,
 * name}` and nothing else. Live parameters no UI could reach.
 *
 *   node test/e2e/space-presets.mjs --api 3011
 */
import { signInApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 16

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const cleanup = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  console.log('\n▶ the presets are served, not guessed at by the front end')
  const presets = await A('/space-presets')
  chk(presets.status === 200, 'the wizard can fetch the workflow presets',
    `GET /space-presets returned ${presets.status} — the wizard would have to hard-code them`)
  const cards = presets.data?.presets ?? []
  chk(
    cards.length === 4 && cards.map((p) => p.key).join(',') === 'starter,marketing,project,product',
    'all four cards from frame 07:06 are there',
    `got ${JSON.stringify(cards.map((p) => p.key))}`,
  )
  const starter = cards.find((p) => p.key === 'starter')
  chk(
    JSON.stringify(starter?.statuses?.map((st) => st.name)) === JSON.stringify(['To do', 'In progress', 'Complete']),
    "Starter's pipeline is the one the frame shows: To do → In progress → Complete",
    `Starter's statuses were ${JSON.stringify(starter?.statuses?.map((st) => st.name))}`,
  )
  chk(
    Array.isArray(presets.data?.features) && presets.data.features.length > 0 &&
      !presets.data.features.includes('remapSubtaskDueDates'),
    'and the ClickApps offered are ones Rundesk has, not ones copied off the frame',
    `the feature list was ${JSON.stringify(presets.data?.features)}`,
  )

  console.log('\n▶ step one collects more than a name `[06:45]`–`[07:01]`')
  const made = await A('/spaces', {
    method: 'POST',
    body: {
      workspaceId,
      name: `Rundex ${stamp}`,
      description: 'Made by the wizard',
      color: '#8b5cf6',
      icon: '🚀',
      visibility: 'private',
      defaultPermission: 'comment',
      presetKey: 'project',
    },
  })
  const space = made.data
  chk(made.status < 400 && !!space?.id, 'a space is created from the wizard',
    `POST /spaces returned ${made.status} ${JSON.stringify(made.error)}`)
  cleanup.push(() => A(`/spaces/${space.id}`, { method: 'DELETE' }))

  chk(space?.description === 'Made by the wizard', 'the description is kept',
    `description came back as ${JSON.stringify(space?.description)} — this parameter was accepted and never sent`)
  chk(space?.icon === '🚀' && space?.color === '#8b5cf6', 'along with the icon and colour',
    `icon=${JSON.stringify(space?.icon)} color=${JSON.stringify(space?.color)}`)
  chk(space?.visibility === 'private', 'Make Private is honoured at creation',
    `visibility came back as ${JSON.stringify(space?.visibility)}`)
  chk(space?.defaultPermission === 'comment', 'and so is Default permission `[frame 06:52]`',
    `defaultPermission came back as ${JSON.stringify(space?.defaultPermission)}`)

  console.log('\n▶ step two actually did something `[07:46]`')
  chk(space?.presetKey === 'project', 'the space records which preset made it',
    `presetKey came back as ${JSON.stringify(space?.presetKey)}`)

  const chosen = cards.find((p) => p.key === 'project')
  chk(
    JSON.stringify(space?.viewConfig?.enabledViews) === JSON.stringify(chosen?.views) &&
      space?.viewConfig?.defaultView === chosen?.defaultView,
    "the preset's default views are on the space",
    `viewConfig came back as ${JSON.stringify(space?.viewConfig)}, preset wanted ${JSON.stringify(chosen?.views)}`,
  )
  chk(
    !!space?.features && chosen?.features.every((f) => space.features[f] === true),
    "and its ClickApps are switched on",
    `features came back as ${JSON.stringify(space?.features)}`,
  )
  chk(
    !!space?.features && space.features.wipLimits === false,
    'while the ones it does not ask for are off, not merely absent',
    `wipLimits came back as ${JSON.stringify(space?.features?.wipLimits)} — a missing key reads as "on"`,
  )

  const statuses = (await A(`/spaces/${space.id}/statuses`)).data ?? []
  chk(
    statuses.length === chosen?.statuses.length &&
      statuses.map((st) => st.key).sort().join(',') === chosen.statuses.map((st) => st.key).sort().join(','),
    "the preset's task statuses were created on the space",
    `the space has ${JSON.stringify(statuses.map((st) => st.key))}, the preset wanted ${JSON.stringify(chosen?.statuses.map((st) => st.key))}`,
  )

  /*
   * The one that makes the purpose question worth asking. Everything above
   * could pass on a build that stores the answer and does nothing with it.
   */
  const lists = (await A(`/lists/space/${space.id}`)).data ?? []
  const names = lists.map((l) => l.name).sort()
  chk(
    JSON.stringify(names) === JSON.stringify([...chosen.seedLists].sort()),
    'and the space is not empty — the preset seeded its first lists',
    `the space came out with ${JSON.stringify(names)}, the preset wanted ${JSON.stringify(chosen?.seedLists)}`,
  )

  console.log('\n▶ and a space made without a preset is unchanged')
  const plain = await A('/spaces', { method: 'POST', body: { workspaceId, name: `Plain ${stamp}` } })
  chk(
    plain.status < 400 && plain.data?.presetKey === null && plain.data?.features === null,
    'no preset means no statuses, no seeded lists and every ClickApp on',
    `presetKey=${JSON.stringify(plain.data?.presetKey)} features=${JSON.stringify(plain.data?.features)}`,
  )
  if (plain.data?.id) cleanup.push(() => A(`/spaces/${plain.data.id}`, { method: 'DELETE' }))
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  for (const fn of cleanup.reverse()) await fn().catch(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
