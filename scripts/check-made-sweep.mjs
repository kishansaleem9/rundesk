#!/usr/bin/env node
/*
 * WHAT A RUN MADE GOES WHEN IT ENDS, AND A KILLED RUN'S WITH THE NEXT ONE
 * (`found-30-sep/suite-runs-leave-accounts-behind`,
 * `found-30-sep/killed-suites-leave-members-behind`).
 *
 * `test/e2e/lib/made.mjs` registers what a suite makes and `made-sweep.mjs`
 * removes it, at the run's exit or, for a run killed where `exit` never runs,
 * at the next run's first registration. Its steady-state answer is a line
 * saying it removed things, which a sweep that removed nothing, or the wrong
 * things, would print as readily. So each case here runs a real process — a
 * probe that registers rows planted for it and ends one way or another — and
 * reads the database afterwards:
 *
 *   · a run that ends, by its last line, by `process.exit(0)` or by a throw,
 *     leaves none of its rows: its account, the organization only it owns
 *     with its workspace, a space it made in a workspace it does not own, a
 *     template its account made there (a key that restricts the account's
 *     delete), the notification it caused an outsider (`actor_id` is set
 *     null, not cascaded) — and the shared workspace, its organization, its
 *     outside owner and a notification no run caused are all still there, the
 *     throw still exits non-zero;
 *   · a run killed with SIGKILL leaves its rows and its journal, and the next
 *     run to register anything removes them, an account known only by its
 *     email among them, and says so;
 *   · `E2E_KEEP_MADE=1` keeps a run's rows and journal, and the next run
 *     removes them;
 *   · a run still going is not swept by another;
 *   · an organization an account from outside the run also owns stays, and
 *     so does one made before the run; so does an account made before the
 *     run, though the run registered it (the admin's address, by mistake);
 *   · an account made while a run ran that no run registered (a page made
 *     it) is named when the run ends;
 *   · a row the sweep cannot remove makes the run exit 1, names it, and keeps
 *     the journal for the next run;
 *   · a run whose first registered row is not in the database it cleans (the
 *     API made it in another: `DATABASE_URL` is not the API's) stops at that
 *     registration, says so, removes nothing, sets its list aside and exits
 *     1; a journal none of whose rows is in the database, whose run never saw
 *     it hold one, is refused and set aside, not passed as "nothing was left
 *     of it"; a run that removed its own rows itself still passes;
 *   · a journal that says no start (its name does not parse and it has no
 *     `{"run":{"started":…}}` line) is refused, and an account older than any
 *     run in it (the admin's, by mistake) and the organization only it owns
 *     stay; one written by hand with a start is swept;
 *   · what the store held for a run's account and workspace goes with them
 *     (`found-30-sep/suite-cleanup-leaves-stored-objects`), on a stub of this
 *     check's own, and the outsider's avatar and the shared workspace's
 *     objects stay.
 *
 * NEEDS A DATABASE WITH THE SCHEMA (`DATABASE_URL`, else the checkout's
 * `.env`). It plants its rows under `made-check-<stamp>` names and
 * `@rundesk.invalid` addresses, and removes whatever of them is left at the end.
 *
 *   node scripts/check-made-sweep.mjs [--mutate]
 *
 * `MADE_LIB_UNDER_TEST` and `MADE_SWEEP_UNDER_TEST` aim it at other copies;
 * `--mutate` breaks each one rule at a time and requires a case to notice.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'
import { freePort } from './lib/free-port.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const E2E_LIB = join(HERE, '..', 'test', 'e2e', 'lib')
const LIB = process.env.MADE_LIB_UNDER_TEST ?? join(E2E_LIB, 'made.mjs')
const SWEEP = process.env.MADE_SWEEP_UNDER_TEST ?? join(E2E_LIB, 'made-sweep.mjs')
const { openDb, databaseUrl } = await import(pathToFileURL(join(E2E_LIB, 'db.mjs')).href)

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

const URL_ = databaseUrl()
const sql = URL_ ? await openDb() : null
if (!sql) {
  console.log('\x1b[31mnot ok\x1b[0m no database to plant in: set DATABASE_URL to one with the schema')
  process.exit(1)
}

const stamp = `made-check-${Date.now()}`
const JOURNALS = mkdtempSync(join(tmpdir(), 'made-check-'))
const PROBES = mkdtempSync(join(tmpdir(), 'made-probe-'))

/*
 * THE PROBE: a stand-in suite. It registers what `PROBE_PLAN` names through
 * the library under test and ends as the plan says. Its file name is its
 * suite name, as a suite's is.
 */
const PROBE = `
const lib = await import(process.env.MADE_LIB_URL)
const plan = JSON.parse(process.env.PROBE_PLAN)
for (const r of plan.register) {
  if (r.shared) lib.changesShared(r.t, r.match ? { match: r.match } : r.id, r.cols)
  else if (r.t === 'users') lib.madeAccount(r)
  else lib.madeRow(r.t, r.id)
}
console.log('REGISTERED')
if (plan.end === 'exit0') process.exit(0)
if (plan.end === 'throw') throw new Error('the probe threw, as a suite does')
if (plan.end === 'kill') process.kill(process.pid, 'SIGKILL')
if (plan.end === 'wait') {
  console.log('READY')
  await new Promise((go) => { process.stdin.on('data', go); process.stdin.on('end', go) })
}
`
const probeFile = (name) => {
  const f = join(PROBES, `${name}.mjs`)
  writeFileSync(f, PROBE)
  return f
}
const env = (plan) => ({
  ...process.env,
  // No store but the one a case names: CI's job names its own (`storeOf`, made-sweep.mjs).
  E2E_STORE_PORT: '',
  E2E_STORE_BUCKET: '',
  DATABASE_URL: URL_,
  E2E_MADE_DIR: JOURNALS,
  MADE_LIB_URL: pathToFileURL(LIB).href,
  MADE_SWEEP_UNDER_TEST: SWEEP,
  PROBE_PLAN: JSON.stringify(plan),
})
const run = (name, plan) => {
  const r = spawnSync(process.execPath, [probeFile(name)], { encoding: 'utf8', timeout: 120_000, env: env(plan) })
  return { code: r.status, signal: r.signal, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}
/** The sweeper run by hand on one journal, as the head of made-sweep.mjs shows. */
const sweepByHand = (file) => {
  const r = spawnSync(process.execPath, [SWEEP, file], { encoding: 'utf8', timeout: 120_000, env: { ...process.env, DATABASE_URL: URL_ } })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}
const HAND = mkdtempSync(join(tmpdir(), 'made-hand-'))
const journals = () => {
  if (!existsSync(JOURNALS)) return []
  return readdirSync(JOURNALS, { recursive: true }).map(String).filter((f) => f.includes('.jsonl') && !f.endsWith('.found.json'))
}

/* ── planting ─────────────────────────────────────────────────────────── */
let n = 0
const slug = (what) => `${stamp}-${what}-${(n += 1)}`
const account = async (what) => {
  const email = `${slug(what)}@rundesk.invalid`
  const [u] = await sql`insert into users (email, display_name) values (${email}, ${`Made check ${what}`}) returning id::text as id`
  return { email, id: u.id }
}
const org = async (what, owners, { old = false } = {}) => {
  const s = slug(what)
  const [o] = old
    ? await sql`insert into organizations (name, slug, created_at) values (${s}, ${s}, now() - interval '1 day') returning id::text as id`
    : await sql`insert into organizations (name, slug) values (${s}, ${s}) returning id::text as id`
  for (const u of owners) await sql`insert into organization_members (organization_id, user_id, role) values (${o.id}, ${u.id}, 'owner')`
  return o.id
}
const workspace = async (orgId, what) => {
  const s = slug(what)
  const [w] = await sql`insert into workspaces (organization_id, name, slug) values (${orgId}, ${s}, ${s}) returning id::text as id`
  return w.id
}
const space = async (wsId, what) => {
  const [s] = await sql`insert into spaces (workspace_id, name) values (${wsId}, ${slug(what)}) returning id::text as id`
  return s.id
}
const template = async (wsId, byId) => {
  const [t] = await sql`insert into project_templates (workspace_id, name, payload, created_by_id) values (${wsId}, ${slug('template')}, ${sql.json({ lists: [] })}, ${byId}) returning id::text as id`
  return t.id
}
const notification = async (to, actor, wsId) => {
  const [n] = await sql`insert into notifications (user_id, workspace_id, actor_id, type, title) values (${to.id}, ${wsId}, ${actor?.id ?? null}, 'access_requested', ${slug('notification')}) returning id::text as id`
  return n.id
}
const exists = async (table, id) => (await sql`select count(*)::int as n from ${sql(table)} where id = ${id}`)[0].n === 1
const accountExists = async (a) => (await sql`select count(*)::int as n from users where id = ${a.id}`)[0].n === 1

/*
 * THE SHARED WORKSPACE a run acts in and does not own: its organization owned
 * by an account from outside every run, as the admin owns the lanes'.
 */
const outsider = await account('outsider')
const sharedOrg = await org('shared', [outsider])
const shared = await workspace(sharedOrg, 'shared')
/** A notification in the outsider's inbox that no run caused: it stays. */
const theirs = await notification(outsider, null, shared)

/** A run's person: an account, the organization only it owns, its workspace; a space and a template in the shared workspace. */
const person = async (what) => {
  const a = await account(what)
  const own = await org(`${what}-own`, [a])
  const ownWs = await workspace(own, `${what}-own`)
  const sp = await space(shared, `${what}-space`)
  const tpl = await template(shared, a.id)
  const note = await notification(outsider, a, shared)
  return { a, own, ownWs, sp, tpl, note }
}
const plan = (p, { byEmailOnly = false } = {}) => [
  { t: 'users', email: p.a.email },
  ...(byEmailOnly ? [] : [{ t: 'users', id: p.a.id }]),
  { t: 'spaces', id: p.sp },
]
const allGone = async (p) => {
  const left = []
  if (await accountExists(p.a)) left.push('the account')
  if (await exists('organizations', p.own)) left.push('its organization')
  if (await exists('workspaces', p.ownWs)) left.push('its workspace')
  if (await exists('spaces', p.sp)) left.push('the space')
  if (await exists('project_templates', p.tpl)) left.push('the template')
  if (await exists('notifications', p.note)) left.push('the notification it caused')
  return left
}
const allThere = async (p) => (await allGone(p)).length === 6
const sharedStands = async () =>
  (await accountExists(outsider)) && (await exists('organizations', sharedOrg)) && (await exists('workspaces', shared)) &&
  (await exists('notifications', theirs))

try {
  console.log('\n▶ a run that ends removes what it made, and nothing else')
  for (const [end, how] of [['fall', 'by reaching its last line'], ['exit0', 'by process.exit(0)']]) {
    const p = await person(`ends-${end}`)
    const r = run(`probe-${end}`, { register: plan(p), end })
    const left = await allGone(p)
    chk(r.code === 0 && left.length === 0,
      `a run that ends ${how} leaves none of its account, its organization and workspace, its space in a shared workspace, the template its account made there, or the notification it caused an outsider`,
      `it exited ${r.code}; still there: ${left.join(', ') || 'nothing'}; it said ${JSON.stringify(r.out.trim().slice(-300))}`)
    chk(/removed what this run made: .*1 account/.test(r.out) && journals().length === 0,
      `and it says what it removed, and keeps no journal (${how})`,
      `it said ${JSON.stringify(r.out.trim().slice(-300))}; journals: ${journals().join(', ') || 'none'}`)
  }
  chk(await sharedStands(), 'the shared workspace, its organization, its owner from outside the run and a notification no run caused are all still there',
    'the sweep removed what the run did not make')

  console.log('\n▶ and what the store held for them, and nothing else')
  {
    /*
     * A STORE OF THIS CHECK'S OWN, the stub a lane runs, named to the sweep as
     * CI names its store. The run's account has an avatar, and the workspace
     * only it owns a logo, a task's file, a call's recording and an emoji; the
     * outsider has an avatar, and the shared workspace a logo and a clip.
     */
    const port = await freePort()
    const store = { base: `http://127.0.0.1:${port}`, bucket: 'made-check' }
    const stub = spawn(process.execPath, [join(HERE, 'e2e-lanes', 's3-stub.mjs'), '--port', String(port), '--bucket', store.bucket], {
      env: { ...process.env, RUNDESK_S3_STUB: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      await new Promise((resolve, reject) => {
        let seen = ''
        const bail = setTimeout(() => reject(new Error(`the store stub never said it was ready: ${seen}`)), 60_000)
        stub.stdout.on('data', (d) => {
          seen += d
          if (/"ready":true/.test(seen)) { clearTimeout(bail); resolve() }
        })
        stub.on('exit', (code) => { clearTimeout(bail); reject(new Error(`the store stub exited with ${code}: ${seen}`)) })
      })
      const listed = async () => {
        const body = await (await fetch(`${store.base}/${store.bucket}?list-type=2`)).text()
        return [...body.matchAll(/<Key>([^<]*)<\/Key>/g)].map((m) => m[1])
      }
      const p = await person('stored')
      const ours = [
        `avatars/${p.a.id}-1.png`,
        `workspace-logos/${p.ownWs}-1.png`,
        `workspaces/${p.ownWs}/tasks/${randomUUID()}/attachments/1-notes.txt`,
        `calls/${p.ownWs}/${randomUUID()}/recording-1.webm`,
        `chat/${p.ownWs}/emoji/1-party.png`,
      ]
      const others = [`avatars/${outsider.id}-1.png`, `workspace-logos/${shared}-1.png`, `workspaces/${shared}/clips/1-demo.webm`]
      for (const k of [...ours, ...others]) {
        const put = await fetch(`${store.base}/${store.bucket}/${k}`, { method: 'PUT', body: 'x' })
        if (put.status !== 200) throw new Error(`the store stub refused ${k}: ${put.status}`)
      }
      const r = spawnSync(process.execPath, [probeFile('probe-store')], {
        encoding: 'utf8',
        timeout: 120_000,
        env: { ...env({ register: plan(p), end: 'fall' }), E2E_STORE_PORT: String(port), E2E_STORE_BUCKET: store.bucket },
      })
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
      const held = await listed()
      const stayed = ours.filter((k) => held.includes(k))
      chk(r.status === 0 && stayed.length === 0 && (await allGone(p)).length === 0,
        'a run that ends leaves nothing the store held for its account and the workspace only it owns — the avatar, the logo, a task’s file, a call’s recording, an emoji',
        `it exited ${r.status}; still in the store: ${stayed.join(', ') || 'nothing'}; it said ${JSON.stringify(out.trim().slice(-300))}`)
      const gone = others.filter((k) => !held.includes(k))
      chk(gone.length === 0 && new RegExp(`removed what this run made: .*${ours.length} stored objects`).test(out),
        'and keeps the outsider’s avatar and the shared workspace’s logo and clip, and says how many objects it removed',
        `gone from the store: ${gone.join(', ') || 'nothing'}; it said ${JSON.stringify(out.trim().slice(-300))}`)
    } finally {
      stub.kill()
    }
  }
  {
    const p = await person('throws')
    const r = run('probe-throw', { register: plan(p), end: 'throw' })
    const left = await allGone(p)
    chk(r.code !== 0 && left.length === 0,
      'a run that throws leaves none of it either, and still exits non-zero',
      `it exited ${r.code}; still there: ${left.join(', ') || 'nothing'}`)
  }

  console.log('\n▶ a run killed where `exit` never runs, then the next run')
  {
    const p = await person('killed')
    const r = run('probe-kill', { register: plan(p, { byEmailOnly: true }), end: 'kill' })
    chk(r.signal === 'SIGKILL' && (await allThere(p)) && journals().length === 1,
      'a run killed with SIGKILL leaves its rows, and its journal naming them',
      `signal ${r.signal}; rows there: ${await allThere(p)}; journals: ${journals().join(', ') || 'none'}`)
    const q = await person('next')
    const r2 = run('probe-next', { register: plan(q), end: 'fall' })
    const left = await allGone(p)
    chk(left.length === 0,
      'the next run to register anything removes what the killed one left — its account known only by its email among it',
      `still there: ${left.join(', ')}; the next run said ${JSON.stringify(r2.out.trim().slice(-300))}`)
    chk(/ended without cleaning up left \(pid \d+/.test(r2.out) && (await allGone(q)).length === 0 && journals().length === 0,
      'and says so, then removes its own at its end, leaving no journal',
      `it said ${JSON.stringify(r2.out.trim().slice(-400))}; journals: ${journals().join(', ') || 'none'}`)
  }

  console.log('\n▶ E2E_KEEP_MADE=1, to read what a failed run made')
  {
    const p = await person('kept')
    const r = spawnSync(process.execPath, [probeFile('probe-keep')], { encoding: 'utf8', timeout: 120_000, env: { ...env({ register: plan(p), end: 'fall' }), E2E_KEEP_MADE: '1' } })
    chk(r.status === 0 && (await allThere(p)) && journals().length === 1 && /E2E_KEEP_MADE: kept what this run made/.test(r.stdout ?? ''),
      'keeps the rows and the journal, and says so',
      `it exited ${r.status}; rows there ${await allThere(p)}; journals: ${journals().join(', ') || 'none'}; it said ${JSON.stringify((r.stdout ?? '').trim().slice(-200))}`)
    // A run that registers nothing sweeps nothing: the sweep comes with the first registration.
    const q = await account('after-keep')
    run('probe-after-keep', { register: [{ t: 'users', id: q.id }], end: 'fall' })
    chk((await allGone(p)).length === 0 && journals().length === 0,
      'and the next run on the database removes them',
      `still there: ${(await allGone(p)).join(', ')}; journals: ${journals().join(', ') || 'none'}`)
  }

  console.log('\n▶ a run still going is not swept by another')
  {
    const p = await person('waiting')
    const w = spawn(process.execPath, [probeFile('probe-wait')], { env: env({ register: plan(p), end: 'wait' }), stdio: ['pipe', 'pipe', 'pipe'] })
    let wOut = ''
    const ready = new Promise((resolve) => {
      w.stdout.on('data', (d) => { wOut += d; if (wOut.includes('READY')) resolve(true) })
      w.on('exit', () => resolve(false))
      setTimeout(() => resolve(false), 60_000)
    })
    const up = await ready
    const q = await person('beside')
    run('probe-beside', { register: plan(q), end: 'fall' })
    const kept = await allThere(p)
    const ended = new Promise((resolve) => w.on('exit', (code) => resolve(code)))
    w.stdin.end('go')
    const code = await ended
    chk(up && kept, 'another run starting beside a live one leaves the live one’s rows alone',
      up ? `rows of the live run left: ${(await allGone(p)).join(', ')}` : `the waiting probe never said READY: ${wOut.slice(-200)}`)
    chk(code === 0 && (await allGone(p)).length === 0, 'and the live run removes them itself when it ends',
      `it exited ${code}; still there: ${(await allGone(p)).join(', ')}`)
  }

  console.log('\n▶ the organizations a run’s account belongs to that are not the run’s')
  {
    const a = await account('co-owner')
    const coOwned = await org('co-owned', [a, outsider])
    const coWs = await workspace(coOwned, 'co-owned')
    const older = await org('older', [a], { old: true })
    const r = run('probe-orgs', { register: [{ t: 'users', email: a.email }], end: 'fall' })
    chk(!(await accountExists(a)) && (await exists('organizations', coOwned)) && (await exists('workspaces', coWs)),
      'an organization an account from outside the run also owns stays, with its workspace, when the run’s account goes',
      `account gone ${!(await accountExists(a))}; organization there ${await exists('organizations', coOwned)}; its workspace there ${await exists('workspaces', coWs)}; it said ${JSON.stringify(r.out.trim().slice(-200))}`)
    chk(await exists('organizations', older),
      'and so does one made before the run, though only the run’s account owned it',
      'an organization older than the run was removed')
  }

  console.log('\n▶ accounts that are not the run’s')
  {
    // Registered by mistake: an account from before the run (the admin's, say).
    const [elder] = await sql`insert into users (email, display_name, created_at) values (${`${slug('elder')}@rundesk.invalid`}, 'Made check elder', now() - interval '1 day') returning id::text as id, email`
    const r = run('probe-elder', { register: [{ t: 'users', email: elder.email }], end: 'fall' })
    chk(r.code === 0 && (await accountExists(elder)) && /kept 1 account older than the run/.test(r.out),
      'an account older than the run is not deleted, though the run registered it, and the run says it kept it',
      `it exited ${r.code}; the account ${(await accountExists(elder)) ? 'is there' : 'was DELETED'}; it said ${JSON.stringify(r.out.trim().slice(-300))}`)
  }
  {
    // Made while a run ran, through nothing that registers it (a page, say).
    const p = await person('noticing')
    const w = spawn(process.execPath, [probeFile('probe-notice')], { env: env({ register: plan(p), end: 'wait' }), stdio: ['pipe', 'pipe', 'pipe'] })
    let wOut = ''
    w.stdout.on('data', (d) => { wOut += d })
    const up = await new Promise((resolve) => {
      const t = setInterval(() => { if (wOut.includes('READY')) { clearInterval(t); resolve(true) } }, 100)
      w.on('exit', () => { clearInterval(t); resolve(false) })
    })
    const stray = await account('unregistered')
    const ended = new Promise((resolve) => w.on('exit', (code) => resolve(code)))
    w.stdin.end('go')
    const code = await ended
    chk(up && code === 1 && wOut.includes('made on this database while this run ran that no run registered') && wOut.includes(stray.email) &&
      /✗ this run left 1 row that nothing it registered removes: 1 account/.test(wOut),
      'an account made on the database while a run ran, that no run registered, is named when the run ends, and the run fails for it',
      `ready ${up}; it exited ${code}; it said ${JSON.stringify(wOut.trim().slice(-400))}`)
    await sql`delete from users where id = ${stray.id}`
  }

  console.log('\n▶ rows made in another database than the one the run cleans')
  {
    // The API made it where DATABASE_URL does not point: here, an id this database has nowhere.
    const p = await person('elsewhere')
    const r = run('probe-elsewhere', { register: [{ t: 'users', id: randomUUID() }, ...plan(p)], end: 'fall' })
    const aside = journals()
    chk(r.code !== 0 && !r.out.includes('REGISTERED') && /has no users row .*made a moment ago/.test(r.out) && (await allThere(p)),
      'a run whose first registered row is not in the database it cleans stops at that registration and says the rows are made in another database',
      `it exited ${r.code}; it went on past the registration: ${r.out.includes('REGISTERED')}; its planted rows all there: ${await allThere(p)}; it said ${JSON.stringify(r.out.trim().slice(-400))}`)
    chk(/cleanup removed nothing: what this run made is in another database/.test(r.out) && !/removed what this run made/.test(r.out) &&
      aside.length === 1 && aside[0].endsWith('.jsonl.elsewhere'),
      'and removes nothing, and sets its list aside where no run sweeps it, saying how to sweep it where the rows are',
      `it said ${JSON.stringify(r.out.trim().slice(-400))}; journals: ${aside.join(', ') || 'none'}`)
    rmSync(join(JOURNALS, aside[0] ?? 'none'), { force: true })
  }
  {
    const file = join(HAND, `probe-gone.${2 ** 22 + 7}.${Date.now()}.jsonl`)
    writeFileSync(file, [{ run: { suite: 'probe-gone', pid: 2 ** 22 + 7, started: Date.now() } }, { t: 'users', email: `${slug('gone')}@rundesk.invalid` }, { t: 'users', id: randomUUID() }, { t: 'spaces', id: randomUUID() }].map((e) => JSON.stringify(e)).join('\n') + '\n')
    const r = sweepByHand(file)
    chk(r.code === 1 && /found none of what this run made in this database/.test(r.out) && !existsSync(file) && existsSync(`${file}.elsewhere`),
      'a journal none of whose rows is in the database, whose run never saw it hold one, is refused and set aside — not passed as “nothing was left of it”',
      `it exited ${r.code}; it said ${JSON.stringify(r.out.trim().slice(-300))}; journal there ${existsSync(file)}, set aside ${existsSync(`${file}.elsewhere`)}`)
  }
  {
    // As create-modal-templates deletes its member itself: the run saw the database hold it, then removed it.
    const a = await account('self-removed')
    const w = spawn(process.execPath, [probeFile('probe-self')], { env: env({ register: [{ t: 'users', email: a.email }, { t: 'users', id: a.id }], end: 'wait' }), stdio: ['pipe', 'pipe', 'pipe'] })
    let wOut = ''
    w.stdout.on('data', (d) => { wOut += d })
    const up = await new Promise((resolve) => {
      const t = setInterval(() => { if (wOut.includes('READY')) { clearInterval(t); resolve(true) } }, 100)
      w.on('exit', () => { clearInterval(t); resolve(false) })
    })
    await sql`delete from users where id = ${a.id}`
    const ended = new Promise((resolve) => w.on('exit', (code) => resolve(code)))
    w.stdin.end('go')
    const code = await ended
    chk(up && code === 0 && /removed what this run made: nothing was left of it/.test(wOut) && journals().length === 0,
      'a run that removed its own rows itself, after the database was seen to hold them, still passes and keeps no journal',
      `ready ${up}; it exited ${code}; it said ${JSON.stringify(wOut.trim().slice(-300))}; journals: ${journals().join(', ') || 'none'}`)
  }

  console.log('\n▶ a journal that says no start')
  {
    // A list written by hand: no <suite>.<pid>.<started> name, no {"run":…} line, and the admin's address by mistake.
    const [elder] = await sql`insert into users (email, display_name, created_at) values (${`${slug('hand-elder')}@rundesk.invalid`}, 'Made check hand elder', now() - interval '1 day') returning id::text as id, email`
    const elderOrg = await org('hand-elder-own', [elder], { old: true })
    const file = join(HAND, 'leftovers.jsonl')
    writeFileSync(file, `${JSON.stringify({ t: 'users', email: elder.email })}\n`)
    const r = sweepByHand(file)
    chk(r.code === 1 && /cleanup refused .*says no time its run started/.test(r.out) && (await accountExists(elder)) && (await exists('organizations', elderOrg)) && existsSync(file),
      'is refused: an account older than any run in it, and the organization only it owns, stay, and so does the journal',
      `it exited ${r.code}; the account ${(await accountExists(elder)) ? 'is there' : 'was DELETED'}, its organization ${(await exists('organizations', elderOrg)) ? 'is there' : 'was DELETED'}; it said ${JSON.stringify(r.out.trim().slice(-300))}`)
    const young = await account('hand-young')
    const started = Date.now() - 60_000
    const file2 = join(HAND, 'leftovers-with-a-start.jsonl')
    writeFileSync(file2, [{ run: { started } }, { t: 'users', email: elder.email }, { t: 'users', id: young.id }].map((e) => JSON.stringify(e)).join('\n') + '\n')
    const r2 = sweepByHand(file2)
    chk(r2.code === 0 && !(await accountExists(young)) && (await accountExists(elder)) && /kept 1 account older than the run/.test(r2.out),
      'and one written by hand with a {"run":{"started":…}} line is swept, keeping what is older than its start',
      `it exited ${r2.code}; the young account ${(await accountExists(young)) ? 'is still there' : 'is gone'}; the elder ${(await accountExists(elder)) ? 'is there' : 'was DELETED'}; it said ${JSON.stringify(r2.out.trim().slice(-300))}`)
  }

  console.log('\n▶ what goes with a registered row, and what is not the run’s')
  {
    // A notification names what it is about only in `target`: by `entityId`, or along its `url`.
    const p = await person('noted')
    // Caused by somebody outside the run, so only what they are about can take them (the run's own go as its account goes).
    const note = async (target) => (await sql`insert into notifications (user_id, workspace_id, actor_id, type, title, target)
      values (${outsider.id}, ${shared}, ${outsider.id}, 'task_assigned', ${slug('about')}, ${sql.json(target)}) returning id::text as id`)[0].id
    const byId = await note({ entityType: 'space', entityId: p.sp, url: `/app/${shared}/${p.sp}` })
    const byUrl = await note({ entityType: 'task', entityId: randomUUID(), url: `/app/${shared}/${p.sp}/x?task=y` })
    const [other] = await sql`insert into notifications (user_id, workspace_id, actor_id, type, title, target)
      values (${outsider.id}, ${shared}, ${outsider.id}, 'task_assigned', ${slug('other')}, ${sql.json({ entityType: 'task', entityId: randomUUID(), url: `/app/${shared}` })}) returning id::text as id`
    const r = run('probe-noted', { register: [{ t: 'users', id: p.a.id }, { t: 'spaces', id: p.sp }], end: 'fall' })
    chk(r.code === 0 && !(await exists('notifications', byId)) && !(await exists('notifications', byUrl)),
      'the notifications about a registered row go with it, whether they name it as what they are about or along their address',
      `it exited ${r.code}; by id ${(await exists('notifications', byId)) ? 'STAYED' : 'gone'}, by address ${(await exists('notifications', byUrl)) ? 'STAYED' : 'gone'}; it said ${JSON.stringify(r.out.trim().slice(-300))}`)
    chk(await exists('notifications', other.id), 'and a notification about something else stays', 'a notification about nothing the run made was removed')
    await sql`delete from notifications where id = ${other.id}`
  }
  {
    // Registered though the run did not make it: a route answered with a row it already had.
    const [old] = await sql`insert into spaces (workspace_id, name, created_at) values (${shared}, ${slug('old-space')}, now() - interval '1 day') returning id::text as id`
    const oldOrg = await org('old-org', [outsider], { old: true })
    const a = await account('old-row')
    const r = run('probe-old-row', { register: [{ t: 'users', id: a.id }, { t: 'spaces', id: old.id }, { t: 'organizations', id: oldOrg }], end: 'fall' })
    chk(r.code === 0 && (await exists('spaces', old.id)) && /kept .*1 space\b.* older than the run/.test(r.out),
      'a registered row older than the run is not deleted, and the run says it kept it',
      `it exited ${r.code}; the space ${(await exists('spaces', old.id)) ? 'is there' : 'was DELETED'}; it said ${JSON.stringify(r.out.trim().slice(-300))}`)
    chk(await exists('organizations', oldOrg), 'and so is a registered organization older than the run (the admin’s holds Main)',
      'an organization older than the run was DELETED because the run registered it')
  }

  console.log('\n▶ what a registered row filed elsewhere')
  {
    const a = await account('filer')
    const sp = await space(shared, 'filer-space')
    // An older project (as Main's General is), the run's list in it, and a project the server made for a list made under the space alone.
    const [oldProject] = await sql`insert into projects (space_id, name, created_at) values (${sp}, ${slug('old-project')}, now() - interval '1 day') returning id::text as id`
    const [list] = await sql`insert into lists (project_id, name) values (${oldProject.id}, ${slug('list')}) returning id::text as id`
    const [youngProject] = await sql`insert into projects (space_id, name) values (${sp}, ${slug('young-project')}) returning id::text as id`
    const [underSpace] = await sql`insert into lists (project_id, name) values (${youngProject.id}, ${slug('list-under-space')}) returning id::text as id`
    const [task] = await sql`insert into tasks (list_id, title) values (${list.id}, ${slug('task')}) returning id::text as id`
    const [oldLabel] = await sql`insert into labels (workspace_id, name, color, created_at) values (${shared}, ${slug('old-label')}, '#888888', now() - interval '1 day') returning id::text as id`
    const [youngLabel] = await sql`insert into labels (workspace_id, name, color) values (${shared}, ${slug('young-label')}, '#888888') returning id::text as id`
    for (const l of [oldLabel, youngLabel]) await sql`insert into task_label_assignments (task_id, label_id) values (${task.id}, ${l.id})`
    const [meeting] = await sql`insert into meetings (workspace_id, title) values (${shared}, ${slug('meeting')}) returning id::text as id`
    const [call] = await sql`insert into calls (workspace_id, started_by_id, meeting_id) values (${shared}, ${a.id}, ${meeting.id}) returning id::text as id`
    const [form] = await sql`insert into forms (workspace_id, title, slug) values (${shared}, ${slug('form')}, ${slug('form-slug')}) returning id::text as id`
    // In a list nobody registered, so only the form can take it.
    const [elsewhere] = await sql`insert into lists (project_id, name, created_at) values (${oldProject.id}, ${slug('list-elsewhere')}, now() - interval '1 day') returning id::text as id`
    const [filed] = await sql`insert into tasks (list_id, title) values (${elsewhere.id}, ${slug('filed-task')}) returning id::text as id`
    await sql`insert into form_submissions (form_id, data, created_task_id) values (${form.id}, ${sql.json({})}, ${filed.id})`
    const [indexed] = await sql`insert into knowledge_embeddings (workspace_id, source_type, source_id, content_hash, embedding, dim) values (${shared}, 'task', ${task.id}, ${slug('hash')}, ${[0.1]}, 1) returning id::text as id`
    const r = run('probe-filer', {
      register: [{ t: 'users', id: a.id }, { t: 'lists', id: list.id }, { t: 'lists', id: underSpace.id }, { t: 'tasks', id: task.id }, { t: 'calls', id: call.id }, { t: 'forms', id: form.id }],
      end: 'fall',
    })
    const stayed = []
    if (await exists('meetings', meeting.id)) stayed.push('the meeting its call filed')
    if (await exists('tasks', filed.id)) stayed.push('the task its form filed')
    if (await exists('labels', youngLabel.id)) stayed.push('the tag its task made')
    if (await exists('projects', youngProject.id)) stayed.push('the project made for its list')
    if (await exists('knowledge_embeddings', indexed.id)) stayed.push('what the AI index held of its task')
    chk(r.code === 0 && stayed.length === 0,
      'what a registered row filed elsewhere goes with it: the meeting its call filed, the task its form filed, the tag its task made, the project made for its list, and what the AI index held of it',
      `it exited ${r.code}; still there: ${stayed.join(', ') || 'nothing'}; it said ${JSON.stringify(r.out.trim().slice(-300))}`)
    const takenUp = /kept[^)]*(label|projects? row)/.test(r.out)
    chk((await exists('labels', oldLabel.id)) && (await exists('projects', oldProject.id)) && !takenUp,
      'and a tag or a project older than the run, which other rows share, stays, not even taken up as the run’s',
      `the older tag ${(await exists('labels', oldLabel.id)) ? 'is there' : 'was DELETED'}, the older project ${(await exists('projects', oldProject.id)) ? 'is there' : 'was DELETED'}; it said ${JSON.stringify(r.out.trim().slice(-300))}`)
    await sql`delete from labels where id = ${oldLabel.id}`
  }

  {
    // The mail in and out of a task and a list that go, and what was opened of the task from a search.
    const a = await account('mailed')
    const sp = await space(shared, 'mailed-space')
    const [project] = await sql`insert into projects (space_id, name) values (${sp}, ${slug('mailed-project')}) returning id::text as id`
    const [list] = await sql`insert into lists (project_id, name) values (${project.id}, ${slug('mailed-list')}) returning id::text as id`
    const [task] = await sql`insert into tasks (list_id, title) values (${list.id}, ${slug('mailed-task')}) returning id::text as id`
    const [inbound] = await sql`insert into inbound_email_messages (list_id, task_id, message_id, from_address, recipient, subject, bytes, attachment_count, outcome)
      values (${list.id}, ${task.id}, ${slug('in')}, 'a@rundesk.invalid', 'list@rundesk.invalid', 'in', 1, 0, 'created') returning id::text as id`
    const [outbound] = await sql`insert into outbound_email_messages (message_id, task_id, list_id, recipient) values (${slug('out')}, ${task.id}, ${list.id}, 'b@rundesk.invalid') returning id::text as id`
    const [opened] = await sql`insert into search_engagement (workspace_id, user_id, entity_type, entity_id) values (${shared}, ${outsider.id}, 'task', ${task.id}) returning id::text as id`
    // Mail refused names neither: to the list's address once it was cut, and replies naming the task in their address.
    const local = `list-${String(stamp).slice(-12)}${Math.floor(Math.random() * 1e6)}`
    await sql`insert into list_email_aliases (list_id, local_part, revoked_at) values (${list.id}, ${local}, now())`
    const refusedTo = async (recipient, what, outcome) => (await sql`insert into inbound_email_messages (message_id, from_address, recipient, subject, bytes, attachment_count, outcome)
      values (${slug(what)}, 'a@rundesk.invalid', ${recipient}, 'refused', 1, 0, ${outcome}) returning id::text as id`)[0]
    const cut = await refusedTo(`${local.toUpperCase()}@inbound.rundesk.local`, 'cut', 'rejected_no_alias')
    const viaList = await refusedTo(`${local}+task-${task.id}@inbound.rundesk.local`, 'via-list', 'rejected_unknown_task')
    const madeUp = await refusedTo(`list-madeup${stamp}+task-${task.id}@inbound.rundesk.local`, 'made-up', 'rejected_unknown_task')
    const r = run('probe-mailed', { register: [{ t: 'users', id: a.id }, { t: 'tasks', id: task.id }, { t: 'lists', id: list.id }], end: 'fall' })
    const stayed = []
    if (await exists('inbound_email_messages', inbound.id)) stayed.push('the mail in')
    if (await exists('inbound_email_messages', cut.id)) stayed.push('the mail to its cut address')
    if (await exists('inbound_email_messages', viaList.id)) stayed.push('the reply to the task through the list’s address')
    if (await exists('inbound_email_messages', madeUp.id)) stayed.push('the reply to the task through an address made up')
    if (await exists('outbound_email_messages', outbound.id)) stayed.push('the mail out')
    if (await exists('search_engagement', opened.id)) stayed.push('the search open')
    chk(r.code === 0 && stayed.length === 0,
      'and so do the mail in and out of a task and a list that go, the mail refused at the list’s cut address and the replies refused that name the task in their address, and what was opened of the task from a search',
      `it exited ${r.code}; still there: ${stayed.join(', ') || 'nothing'}; it said ${JSON.stringify(r.out.trim().slice(-300))}`)
  }

  {
    // The mail in from an account the run made that names nothing (a reply refused as answering nothing of ours), and out to it about a task that stays; an older account's stays.
    const a = await account('replier')
    const sp = await space(shared, 'replier-space')
    const [project] = await sql`insert into projects (space_id, name) values (${sp}, ${slug('replier-project')}) returning id::text as id`
    const [list] = await sql`insert into lists (project_id, name) values (${project.id}, ${slug('replier-list')}) returning id::text as id`
    const [task] = await sql`insert into tasks (list_id, title) values (${list.id}, ${slug('replier-task')}) returning id::text as id`
    const elderEmail = `${slug('elder-replier')}@rundesk.invalid`
    const [elder] = await sql`insert into users (email, display_name, created_at) values (${elderEmail}, 'Made check elder replier', now() - interval '1 day') returning id::text as id`
    const inbound = async (from, what) => (await sql`insert into inbound_email_messages (message_id, from_address, recipient, subject, bytes, attachment_count, outcome)
      values (${slug(what)}, ${from}, 'notifications@rundesk.invalid', 'Re: a notice', 1, 0, 'rejected_no_alias') returning id::text as id`)[0]
    const refused = await inbound(a.email.toUpperCase(), 'refused')
    const fromElder = await inbound(elderEmail, 'from-elder')
    const [toThem] = await sql`insert into outbound_email_messages (message_id, task_id, list_id, recipient) values (${slug('to-them')}, ${task.id}, ${list.id}, ${a.email}) returning id::text as id`
    const r = run('probe-replier', { register: [{ t: 'users', id: a.id }, { t: 'users', email: elderEmail }], end: 'fall' })
    const stayed = []
    if (await exists('inbound_email_messages', refused.id)) stayed.push('the refused reply from its account')
    if (await exists('outbound_email_messages', toThem.id)) stayed.push('the mail out to its account')
    const elderStays = (await exists('inbound_email_messages', fromElder.id)) && (await exists('users', elder.id))
    chk(r.code === 0 && stayed.length === 0 && elderStays,
      'and the mail in from an account the run made, filed nowhere (a reply refused), and out to it about a task that stays, go with the account; an older account’s mail stays',
      `it exited ${r.code}; still there: ${stayed.join(', ') || 'nothing'}; the older account’s mail ${elderStays ? 'stayed' : 'went'}; it said ${JSON.stringify(r.out.trim().slice(-300))}`)
    await sql`delete from inbound_email_messages where id = ${fromElder.id}`
    await sql`delete from outbound_email_messages where id = ${toThem.id}`
    await sql`delete from users where id = ${elder.id}`
    await sql`delete from tasks where id = ${task.id}`
  }

  console.log('\n▶ what a run leaves that nothing registered')
  /** A probe that waits, while this check makes rows as the run would; then it ends. */
  const whileRunning = async (name, register, make, file = probeFile(name)) => {
    const w = spawn(process.execPath, [file], { env: env({ register, end: 'wait' }), stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    w.stdout.on('data', (d) => { out += d })
    w.stderr.on('data', (d) => { out += d })
    // Heard from the start: a probe that ends before it is ready has ended, and is not waited for.
    const ended = new Promise((resolve) => w.on('exit', (code) => resolve(code)))
    const up = await new Promise((resolve) => {
      const t = setInterval(() => { if (out.includes('READY')) { clearInterval(t); resolve(true) } }, 100)
      void ended.then(() => { clearInterval(t); resolve(false) })
    })
    const made = up ? await make() : null
    w.stdin.end('go')
    return { up, code: await ended, out, made }
  }
  {
    const a = await account('leaves')
    const r = await whileRunning('probe-leaves', [{ t: 'users', id: a.id }], () => space(shared, 'left-space'))
    chk(r.up && r.code === 1 && /✗ this run left 1 row that nothing it registered removes: 1 space/.test(r.out),
      'a run that leaves a row made while it ran, that it never registered, fails and names the table',
      `ready ${r.up}; it exited ${r.code}; it said ${JSON.stringify(r.out.trim().slice(-300))}`)
    if (r.made) await sql`delete from spaces where id = ${r.made}`
  }
  {
    // A table with no created_at says when its row came by a time of its own: a watcher added to a task older than the run.
    const a = await account('watching')
    const [old] = await sql`insert into tasks (list_id, title, created_at)
      select l.id, ${slug('old-task')}, now() - interval '1 day' from lists l join projects p on p.id = l.project_id join spaces s on s.id = p.space_id
      where s.workspace_id = ${shared} limit 1 returning id::text as id`
    const r = old ? await whileRunning('probe-watching', [{ t: 'users', id: a.id }], async () => {
      await sql`insert into task_watchers (task_id, user_id) values (${old.id}, ${outsider.id})`
      return null
    }) : { up: false, code: null, out: 'no list in the shared workspace to put the older task in' }
    chk(r.up && r.code === 1 && /✗ this run left 1 row that nothing it registered removes: 1 task_watchers row/.test(r.out),
      'and a row of a table with no created_at, read by its own time of making (a watcher added), fails it too',
      `ready ${r.up}; it exited ${r.code}; it said ${JSON.stringify(String(r.out).trim().slice(-300))}`)
    if (old) await sql`delete from tasks where id = ${old.id}`
  }
  {
    // What using the product as somebody writes: a sign-in, a counted request, an AI call, the audit trail; and what the API's own schedules write.
    const a = await account('uses')
    const r = await whileRunning('probe-uses', [{ t: 'users', id: a.id }], async () => {
      await sql`insert into sessions (user_id, refresh_token, expires_at) values (${outsider.id}, ${slug('session')}, now() + interval '1 day')`
      await sql`insert into ai_usage (workspace_id, user_id, feature, model) values (${shared}, ${outsider.id}, ${slug('feature')}, 'stub')`
      await sql`insert into notifications (user_id, workspace_id, type, title) values (${outsider.id}, ${shared}, 'task_overdue', ${slug('due')})`
      return null
    })
    chk(r.up && r.code === 0 && !/✗ this run left/.test(r.out),
      'and one that leaves only a sign-in, an AI call counted toward the hourly limit, and a notification the API’s own schedule wrote (no actor) passes',
      `ready ${r.up}; it exited ${r.code}; it said ${JSON.stringify(r.out.trim().slice(-300))}`)
    await sql`delete from sessions where user_id = ${outsider.id}`
    await sql`delete from ai_usage where feature like ${`${stamp}-%`}`
    await sql`delete from notifications where title like ${`${stamp}-due-%`}`
  }
  {
    // A notification a request writes for nobody: a test notification has no actor, and is no schedule's.
    const a = await account('tests')
    const r = await whileRunning('probe-tests', [{ t: 'users', id: a.id }], async () => {
      await sql`insert into notifications (user_id, workspace_id, type, title) values (${outsider.id}, ${shared}, 'test_notification', ${slug('test')})`
      return null
    })
    chk(r.up && r.code === 1 && /✗ this run left 1 row that nothing it registered removes: 1 notifications row/.test(r.out),
      'but one that leaves a notification with no actor of a kind no schedule writes (a test notification) fails',
      `ready ${r.up}; it exited ${r.code}; it said ${JSON.stringify(r.out.trim().slice(-300))}`)
    await sql`delete from notifications where title like ${`${stamp}-test-%`}`
  }
  {
    // A suite that registers nothing is armed as it begins: a script in a test/e2e directory of its own.
    const dir = join(PROBES, 'test', 'e2e')
    mkdirSync(dir, { recursive: true })
    const suite = join(dir, 'probe-suite.mjs')
    writeFileSync(suite, PROBE)
    const r = await whileRunning('probe-suite', [], () => space(shared, 'suite-left-space'), suite)
    chk(r.up && r.code === 1 && /✗ this run left 1 row that nothing it registered removes: 1 space/.test(r.out) && journals().length === 0,
      'a suite that registers nothing is still read when it ends: the row it left fails it',
      `ready ${r.up}; it exited ${r.code}; it said ${JSON.stringify(r.out.trim().slice(-300))}; journals: ${journals().join(', ') || 'none'}`)
    if (r.made) await sql`delete from spaces where id = ${r.made}`
  }

  console.log('\n▶ what a run left changed of the rows it found')
  {
    // A task and a tag older than the run, as every run shares; and an account older than the run, which signs in.
    const [found] = await sql`insert into tasks (list_id, title, created_at)
      select l.id, ${slug('found-task')}, now() - interval '1 day' from lists l join projects p on p.id = l.project_id join spaces s on s.id = p.space_id
      where s.workspace_id = ${shared} limit 1 returning id::text as id, title`
    const [tag] = await sql`insert into labels (workspace_id, name, color, created_at) values (${shared}, ${slug('found-tag')}, '#888888', now() - interval '1 day') returning id::text as id, name`
    const [signer] = await sql`insert into users (email, display_name, created_at) values (${`${slug('found-signer')}@rundesk.invalid`}, 'Made check signer', now() - interval '1 day') returning id::text as id`
    const a = await account('finder')
    const changes = await whileRunning('probe-changes', [{ t: 'users', id: a.id }], async () => {
      await sql`update tasks set title = ${`${found.title} changed`}, priority = 'urgent', updated_at = now() where id = ${found.id}`
      return null
    })
    chk(changes.up && changes.code === 1 && /✗ this run left 1 row it found changed: tasks \S+ \(title, priority\)/.test(changes.out),
      'a run that changes a row it found and leaves it so fails, naming the row and what changed, not its updated_at',
      `ready ${changes.up}; it exited ${changes.code}; it said ${JSON.stringify(changes.out.trim().slice(-300))}`)
    await sql`update tasks set title = ${found.title}, priority = 'normal' where id = ${found.id}`
    const restores = await whileRunning('probe-restores', [{ t: 'users', id: (await account('restorer')).id }], async () => {
      await sql`update tasks set title = ${`${found.title} for now`} where id = ${found.id}`
      await sql`update tasks set title = ${found.title}, updated_at = now() where id = ${found.id}`
      return null
    })
    chk(restores.up && restores.code === 0 && !/✗ this run left/.test(restores.out),
      'and one that puts back what it changed passes, though the row’s updated_at moved',
      `ready ${restores.up}; it exited ${restores.code}; it said ${JSON.stringify(restores.out.trim().slice(-300))}`)
    const removes = await whileRunning('probe-removes', [{ t: 'users', id: (await account('remover')).id }], async () => {
      await sql`delete from labels where id = ${tag.id}`
      return null
    })
    chk(removes.up && removes.code === 1 && new RegExp(`✗ this run left 1 row it found changed: labels ${tag.name} \\(gone\\)`).test(removes.out),
      'and one that removes a row it found fails, saying it is gone',
      `ready ${removes.up}; it exited ${removes.code}; it said ${JSON.stringify(removes.out.trim().slice(-300))}`)
    const signs = await whileRunning('probe-signs-in', [{ t: 'users', id: (await account('signer-run')).id }], async () => {
      await sql`update users set last_seen_at = now() where id = ${signer.id}`
      return null
    })
    chk(signs.up && signs.code === 0 && !/✗ this run left/.test(signs.out),
      'and one that only signs an account in (its last_seen_at) passes',
      `ready ${signs.up}; it exited ${signs.code}; it said ${JSON.stringify(signs.out.trim().slice(-300))}`)
    // Said before it changes them, the run's changes to a shared row are put back as it found them, a NULL a NULL.
    await sql`update tasks set description = null where id = ${found.id}`
    const says = await whileRunning('probe-says', [{ t: 'users', id: (await account('sayer')).id }, { shared: true, t: 'tasks', match: { title: found.title }, cols: ['description', 'priority'] }], async () => {
      await sql`update tasks set description = ${'changed'}, priority = 'urgent' where id = ${found.id}`
      return null
    })
    const [after] = await sql`select description, priority from tasks where id = ${found.id}`
    chk(says.up && says.code === 0 && !/✗ this run left/.test(says.out) && after?.description === null && after?.priority === 'normal' && /put back as this run found them: tasks \S+ \(description, priority\)/.test(says.out),
      'and one that said, before, which columns of a shared row it changes has them put back as it found them, a NULL a NULL, and passes',
      `ready ${says.up}; it exited ${says.code}; now ${JSON.stringify(after)}; it said ${JSON.stringify(says.out.trim().slice(-300))}`)
    const foundLeft = readdirSync(JOURNALS, { recursive: true }).filter((f) => String(f).endsWith('.found.json'))
    chk(foundLeft.length === 0,
      'and what each run found is read once, at its end, and not kept',
      `still kept: ${foundLeft.join(', ')}`)
    await sql`delete from tasks where id = ${found.id}`
    await sql`delete from users where id = ${signer.id}`
  }
  {
    // A run killed before its end: what it found is removed with its journal by the next run.
    const a = await account('killed-finder')
    const killed = run('probe-killed-finder', { register: [{ t: 'users', id: a.id }], end: 'kill' })
    const kept = readdirSync(JOURNALS, { recursive: true }).filter((f) => String(f).includes('probe-killed-finder') && String(f).endsWith('.found.json'))
    const b = await account('after-killed')
    run('probe-after-killed', { register: [{ t: 'users', id: b.id }], end: 'fall' })
    const after = readdirSync(JOURNALS, { recursive: true }).filter((f) => String(f).includes('probe-killed-finder') && String(f).endsWith('.found.json'))
    chk(killed.code !== 0 && kept.length === 1 && after.length === 0,
      'and what a killed run found is removed by the next run, with its journal',
      `the killed run exited ${killed.code}; its file ${kept.length ? 'was' : 'was not'} kept, and after the next run ${after.length ? 'still is' : 'is gone'}`)
  }

  console.log('\n▶ a row the sweep cannot remove')
  {
    // After a row the database has (so the run has seen it is the right one), a table it has not.
    const a = await account('stuck')
    const r = run('probe-stuck', { register: [{ t: 'users', id: a.id }, { t: 'no_such_table', id: randomUUID() }], end: 'fall' })
    chk(r.code === 1 && /✗ cleanup left behind what this run made: .*no_such_table/.test(r.out) && journals().length === 1,
      'makes the run exit 1, names it, and keeps the journal for the next run',
      `it exited ${r.code}; it said ${JSON.stringify(r.out.trim().slice(-300))}; journals: ${journals().join(', ') || 'none'}`)
  }
} catch (e) {
  fail += 1
  console.log(`  \x1b[31mFAIL\x1b[0m the cases ran to their end — ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')}`)
} finally {
  // Whatever of this check's own rows is left: a mutant's, or a failed case's.
  const like = `${stamp}-%`
  await sql`delete from project_templates where name like ${like}`.catch(() => {})
  await sql`delete from spaces where name like ${like}`.catch(() => {})
  await sql`delete from organizations where slug like ${like}`.catch(() => {})
  await sql`delete from users where email like ${`${stamp}-%@rundesk.invalid`}`.catch(() => {})
  await sql.end({ timeout: 5 }).catch(() => {})
  rmSync(JOURNALS, { recursive: true, force: true })
  rmSync(PROBES, { recursive: true, force: true })
  rmSync(HAND, { recursive: true, force: true })
}

console.log(`\n${pass} passed, ${fail} failed`)
const MIN_CASES = 46
if (pass + fail < MIN_CASES) {
  console.log(`\x1b[31mnot ok\x1b[0m only ${pass + fail} case(s) ran, below the floor of ${MIN_CASES}`)
  fail += 1
}

let blind = 0
if (process.argv.includes('--mutate') && !process.env.MADE_LIB_UNDER_TEST && !process.env.MADE_SWEEP_UNDER_TEST) {
  const alive = (mutant) => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(mutant).href)})`], { encoding: 'utf8', timeout: 30_000 })
    return { ok: r.status === 0, why: r.stderr }
  }
  blind += proveMutationsBite({
    subject: join(E2E_LIB, 'made.mjs'),
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'MADE_LIB_UNDER_TEST',
    label: 'the registry',
    alive,
    mutations: [
      ['no-exit-hook', "process.on('exit', () => removeAtExit(url))", 'void removeAtExit'],
      ['exit-unsaid', "const r = runSweeper(['--exit', journal], url)", 'const r = runSweeper([journal], url)'],
      ['suites-not-armed', "if (/[\\\\/]test[\\\\/]e2e[\\\\/][^\\\\/]+\\.mjs$/.test(path.resolve(process.argv[1] ?? ''))) arm()", 'void 0'],
      ['no-sweep-of-ended-runs', "const swept = runSweeper(['--ended', dir], url)", 'const swept = { status: 0 }'],
      ['nothing-journaled', 'if (journal) fs.appendFileSync(journal, `${JSON.stringify(entry)}\\n`)', 'void entry'],
      ['a-leftover-passes', 'if (!process.exitCode) process.exitCode = 1', 'void 0'],
      ['keep-ignored', "if (process.env.E2E_KEEP_MADE === '1') {", 'if (false) {'],
      ['place-unchecked', 'if (journal && entry.id && !placed) checkPlace(entry)', 'void placed'],
      ['held-unsaid', 'fs.appendFileSync(journal, `${JSON.stringify({ held: { t: entry.t, id: entry.id } })}\\n`)', 'void 0'],
      ['shared-unsaid', "  if (journal) fs.appendFileSync(journal, `${JSON.stringify({ shared })}\\n`)", '  void shared'],
      ['nothing-found', "    runSweeper(['--found', journal], url)\n", ''],
      ['elsewhere-swept-here', '  if (elsewhere) {\n    console.log(`  ✗ cleanup removed nothing', '  if (false) {\n    console.log(`  ✗ cleanup removed nothing'],
    ],
  })
  blind += proveMutationsBite({
    subject: join(E2E_LIB, 'made-sweep.mjs'),
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'MADE_SWEEP_UNDER_TEST',
    label: 'the sweep',
    alive,
    mutations: [
      ['shared-not-put-back', 'const back = shared.length ? await putBack(sql, found, shared) : []', 'const back = []'],
      ['found-changes-pass', "      if (changed.length) {\n        status = 1", "      if (changed.length) {\n        void 0"],
      ['found-all-by-use', '.filter((k) => !byUse.has(k) &&', '.filter((k) => false &&'],
      ['found-none-by-use', "const byUse = new Set([...CHANGED_BY_USE['*'], ...(CHANGED_BY_USE[table] ?? [])])", 'const byUse = new Set()'],
      ['found-gone-passes', "      if (!is) {\n        out.push({ table, id, label, cols: null })\n        continue\n      }", '      if (!is) continue'],
      ['found-young-read', 'if (at && Date.parse(was[at]) >= started - 60_000) continue', 'void at'],
      ['found-kept', "      } finally {\n        fs.rmSync(file, { force: true })\n      }", '      } finally {\n        void file\n      }'],
      ['killed-found-kept', "if (!stillRunning(Number(f[2]), `${f[1]}.mjs`) && !names.includes(name.replace(/\\.found\\.json$/, ''))) fs.rmSync(path.join(dir, name), { force: true })", 'void f'],
      ['live-runs-swept', 'if (stillRunning(Number(pid), `${suite}.mjs`)) continue', 'void suite'],
      ['co-owned-organizations-go', "and not exists (select 1 from organization_members m\n                          where m.organization_id = o.id and m.role = 'owner' and not (m.user_id = any(${accountIds}::uuid[])))", ''],
      ['older-organizations-go', "o.created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'", 'true'],
      ['restricting-keys-ignored', "await clearRestricting(sql, 'users', accountIds)", 'void 0'],
      ['caused-notifications-kept', '(await sql`delete from notifications where actor_id = any(${accountIds}::uuid[])`).count)', '0)'],
      ['elder-accounts-deleted', 'const accountIds = accounts.filter((a) => a.ours).map((a) => a.id)', 'const accountIds = accounts.map((a) => a.id)'],
      ['unregistered-unsaid', '  return (await sql`\n    select email from users\n    where created_at >= to_timestamp(${started} / 1000.0)', '  return [] || (await sql`\n    select email from users\n    where created_at >= to_timestamp(${started} / 1000.0)'],
      ['accounts-by-id-only','where id = any(${j.accountIds}::uuid[]) or lower(email) = any(${j.emails}::text[])`)) ?? []', 'where id = any(${j.accountIds}::uuid[])`)) ?? []'],
      ['left-rows-unread', 'if (r?.[0]?.n) left.push(said(table, r[0].n))', 'void r'],
      ['absent-rows-pass', 'if (sql && named && !j.held && (await presentOf(sql, j)) === 0) {', 'if (false) {'],
      ['held-ignored', '    if (e.held) {', '    if (false) {'],
      ['holds-anything', "return (await sql`select 1 from ${sql(table)} where id = ${id}::uuid`).length ? 0 : 3", 'return 0'],
      ['startless-journals-swept', 'if (!(j.run.started > 0)) {', 'if (false) {'],
      ['store-left', "const purged = holding ? await step('remove what the store held for them', () => purgeStored(holding, storeOf())) : null", 'const purged = null'],
      ['avatars-left', '    ...accountIds.map((id) => `avatars/${id}-`),\n', ''],
      ['workspace-objects-left', '    ...ws.flatMap((id) => [`workspaces/${id}/`, `calls/${id}/`, `chat/${id}/`, `workspace-logos/${id}-`]),\n', ''],
      ['every-avatar-goes', '    ...accountIds.map((id) => `avatars/${id}-`),\n', "    ...accountIds.map(() => 'avatars/'),\n"],
      ['notifications-about-them-kept', 'if (gone.length) {', 'if (false) {'],
      ['notifications-by-id-only', "             or exists (select 1 from regexp_matches(coalesce(n.target->>'url', ''), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g') m\n                        where m[1] in (select id from gone)))`).count)", '             )`).count)'],
      ['call-meetings-left', "  if (j.rows.has('calls')) {", "  if (false) {"],
      ['form-tasks-left', "  if (j.rows.has('forms')) {", "  if (false) {"],
      ['list-projects-left', "  if (j.rows.has('lists')) {", "  if (false) {"],
      ['task-tags-left', "  if (j.rows.has('tasks')) {\n    await filedBy('tags their tasks made'", "  if (false) {\n    await filedBy('tags their tasks made'"],
      ['shared-projects-taken', "where l.id = any(${[...j.rows.get('lists')]}::uuid[]) and p.created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'`)", "where l.id = any(${[...j.rows.get('lists')]}::uuid[])`)"],
      ['shared-tags-taken', "where a.task_id = any(${[...j.rows.get('tasks')]}::uuid[]) and l.created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'`)", "where a.task_id = any(${[...j.rows.get('tasks')]}::uuid[])`)"],
      ['mail-left', "  if (j.rows.has('tasks') || j.rows.has('lists') || j.rows.has('list_email_aliases')) {", "  if (false) {"],
      ['mail-to-cut-addresses-left', "         or lower(split_part(split_part(recipient, '@', 1), '+', 1)) in (\n           select lower(local_part) from list_email_aliases\n           where list_id = any(${named('lists')}::uuid[]) or id = any(${named('list_email_aliases')}::uuid[]))\n", ''],
      ['mail-naming-their-tasks-left', "\n         or substring(lower(recipient) from '\\\\+task-([0-9a-f-]{36})@') = any(${named('tasks')}::text[])`)", '`)'],
      ['mail-from-their-accounts-left', '  if (j.accountIds.length || j.emails.length) {\n    const theirs', '  if (false) {\n    const theirs'],
      ['elder-accounts-mail-taken', "      where (id = any(${j.accountIds}::uuid[]) or lower(email) = any(${j.emails}::text[]))\n        and created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'`", "      where (id = any(${j.accountIds}::uuid[]) or lower(email) = any(${j.emails}::text[]))`"],
      ['search-opens-left', "(await sql`delete from search_engagement where entity_id in (select unnest(${gone}::text[]))`).count)", '0)'],
      ['made-at-only-created', "and (c.column_name = 'created_at' or (c.column_default like 'now()%' and c.column_name <> 'updated_at' and c.column_name not like 'last\\\\_%'))", "and c.column_name = 'created_at'"],
      ['index-left', "(await sql`delete from knowledge_embeddings where source_id::text in (select unnest(${gone}::text[]))`).count)", '0)'],
      ['elder-organizations-deleted', "where id = any(${registeredOrgs}::uuid[]) and created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'", 'where id = any(${registeredOrgs}::uuid[])'],
      ['elder-rows-deleted', 'if (elder.length) kept.push(said(table, elder.length))\n      return ids.filter((id) => !elder.includes(id))', 'return ids'],
      ['leftovers-read-by-hand', "const atExit = argv[0] === '--exit'", 'const atExit = true'],
      ['leftovers-pass', '      if (left.length) {\n        status = 1', '      if (false) {\n        status = 1'],
      ['use-counted-as-left', "c.ordinal_position`).filter((r) => !(r.t in LEFT_BY_USE))", 'c.ordinal_position`)'],
      ['unscheduled-notifications-pass', "and (actor_id is not null or not (type::text = any(${SCHEDULED}::text[])))", 'and actor_id is not null'],
      ['scheduled-notifications-counted', 'created_at >= to_timestamp(${started} / 1000.0) and (actor_id is not null or not (type::text = any(${SCHEDULED}::text[])))`', 'created_at >= to_timestamp(${started} / 1000.0)`'],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
