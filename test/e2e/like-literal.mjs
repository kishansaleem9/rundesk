/**
 * A SEARCH MATCHES WHAT WAS TYPED: `%`, `_` AND `\` ARE TEXT, NOT A PATTERN.
 *
 * NOT A FRAME ROW: `found-28-sep/like-patterns-escaped-four-ways`, found closing
 * `job-title-rule-and-message-disagree`. `%` and `_` are LIKE's wildcards and
 * `\` its escape. Seven searches put the query into ILIKE as it came, so "50%"
 * found "500" as well; the escape was written four different ways elsewhere,
 * one of them leaving the backslash itself unescaped, so a template search
 * ending in `\` escaped the closing `%` and found nothing. Every site goes
 * through `likeContaining` (`common/sql/like.ts`) now.
 *
 * Each surface is given two names that a pattern cannot tell apart and a
 * literal search can, and is asked for the one.
 *
 *   node test/e2e/like-literal.mjs --api 3027
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`
const q = (s) => encodeURIComponent(s)

const stamp = Date.now()
const TAG = `lik${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the saved messages are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const space = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })).data?.id
  const project = (await A('/projects', { method: 'POST', body: { spaceId: space, name: `${TAG} project` } })).data?.id
  const list = (await A('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} list` } })).data?.id
  if (!list) throw new Error('could not stage the list')
  const PCT = `${TAG} cut 50% now`
  const NUM = `${TAG} cut 500 now`
  for (const title of [PCT, NUM]) {
    const t = await A('/tasks', { method: 'POST', body: { listId: list, title } })
    if (t.status >= 300) throw new Error(`could not make "${title}": ${said(t)}`)
  }

  // ══ 1. THE WORKSPACE SEARCH ══════════════════════════════════════════════
  console.log('\n▶ the workspace search, for “50%”')
  const found = await A(`/search/${WS}?q=${q(`${TAG} cut 50%`)}&types=task`)
  const titles = (found.data ?? []).map((h) => h.title ?? h.name).filter(Boolean)
  chk(
    found.ok && titles.includes(PCT) && !titles.includes(NUM),
    'the workspace search for “50%” finds the task with 50% in its title and not the one with 500',
    `${said(found)}; found ${JSON.stringify(titles)}`,
  )

  // ══ 2. SAVED MESSAGES ════════════════════════════════════════════════════
  console.log('\n▶ saved messages, for “50%”')
  const channel = await A(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `${TAG}-chan` } })
  const channelId = channel.data?.id
  const saved = []
  for (const body of [PCT, NUM]) {
    const m = await A(`/chat/channels/${channelId}/messages`, { method: 'POST', body: { body } })
    const s = m.data?.id ? await A(`/chat/messages/${m.data.id}/save`, { method: 'POST', body: {} }) : { status: 0 }
    saved.push(s.status)
  }
  const inSaved = await A(`/workspaces/${WS}/chat/saved?q=${q('50%')}`)
  const bodies = (inSaved.data ?? []).map((r) => r.body ?? r.message?.body).filter(Boolean)
  chk(
    saved.every((s) => s > 0 && s < 300) && bodies.includes(PCT) && !bodies.includes(NUM),
    'searching saved messages for “50%” finds the saved message with 50% and not the one with 500',
    `saved ${JSON.stringify(saved)}; ${said(inSaved)}; found ${JSON.stringify(bodies)}`,
  )

  // ══ 3. TEMPLATES, ENDING IN A BACKSLASH ══════════════════════════════════
  console.log('\n▶ templates, for a name ending in a backslash')
  const SLASH = `${TAG} path a\\`
  const tmpl = await A(`/workspaces/${WS}/project-templates`, { method: 'POST', body: { name: SLASH, targetType: 'project', payload: { lists: [{ name: 'L', position: 0, tasks: [] }] } } })
  const browsed = await A(`/workspaces/${WS}/project-templates/browse?q=${q(`${TAG} path a\\`)}`)
  const names = (browsed.data?.items ?? browsed.data?.templates ?? browsed.data ?? []).map?.((t) => t.name) ?? []
  chk(
    tmpl.ok && browsed.ok && names.includes(SLASH),
    'a template search ending in a backslash finds the template whose name ends in it',
    `made ${said(tmpl)}; ${said(browsed)}; found ${JSON.stringify(names)}`,
  )

  // ══ 4. A PERSON'S ACTIVITY ═══════════════════════════════════════════════
  console.log('\n▶ a person’s activity, for “50%”')
  const act = await A(`/workspaces/${WS}/people/${adminId}/activity?q=${q(`${TAG} cut 50%`)}`)
  const rows = act.data?.items ?? act.data ?? []
  const actTitles = [...new Set(rows.map((r) => r.taskTitle ?? r.task?.title ?? r.title).filter(Boolean))]
  chk(
    act.ok && actTitles.includes(PCT) && !actTitles.includes(NUM),
    'a person’s activity searched for “50%” lists the task with 50% and not the one with 500',
    `${said(act)}; found ${JSON.stringify(actTitles)}`,
  )

  // ══ 5. THE PLATFORM'S USER DIRECTORY ═════════════════════════════════════
  console.log('\n▶ the platform user directory, for “50%”')
  const people = []
  for (const [key, name] of [['pct', `${TAG} fifty 50% user`], ['num', `${TAG} fifty 500 user`]]) {
    const email = `${TAG}-${key}@rundesk.invalid`
    await signUpApi(API, { fullName: name, email, password: 'LikeLiteral@12345!', organizationName: `Like ${key} ${stamp}`, organizationSlug: `like-${key}-${stamp}` })
    people.push(name)
  }
  const dir = await A(`/organizations/users?q=${q(`${TAG} fifty 50%`)}`)
  const dirNames = (dir.data?.items ?? dir.data?.users ?? dir.data ?? []).map?.((u) => u.displayName ?? u.name) ?? []
  chk(
    dir.ok && dirNames.includes(people[0]) && !dirNames.includes(people[1]),
    'the platform user directory searched for “50%” finds the person with 50% in their name and not the one with 500',
    `${said(dir)}; found ${JSON.stringify(dirNames)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
