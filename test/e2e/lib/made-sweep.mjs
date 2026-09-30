#!/usr/bin/env node
/**
 * REMOVE WHAT A RUN'S JOURNAL NAMES (`made.mjs` writes the journals and runs
 * this; `found-30-sep/suite-runs-leave-accounts-behind`,
 * `found-30-sep/killed-suites-leave-members-behind`).
 *
 *   node test/e2e/lib/made-sweep.mjs <journal>…      the exit: these runs' own
 *   node test/e2e/lib/made-sweep.mjs --ended <dir>   every journal in <dir>
 *                                                    whose process is gone
 *   node test/e2e/lib/made-sweep.mjs --holds <table> <id>
 *                                                    whether this database has
 *                                                    the row (0 yes, 3 no, 2 it
 *                                                    could not be read)
 *
 * Exits 0 when no row a swept journal names is left, 1 when one is (and says
 * which, and keeps that journal for the next run to try again).
 *
 * AND 1, REMOVING NOTHING, IN TWO MORE CASES, each of which answered "removed:
 * nothing was left of it" and 0 before:
 *
 *   · A JOURNAL THAT SAYS NO START. The run's start is what keeps the admin: an
 *     account or an organization older than the run is not the run's, whatever
 *     was registered. A journal's start is in its name
 *     (`<suite>.<pid>.<started>.jsonl`) or its `{"run":{"started":…}}` line; one
 *     with neither (a list written by hand, `leftovers.jsonl`) read as a run
 *     from 1970, and a mistaken admin address in it deleted the admin and every
 *     organization only the admin owns, Main Workspace's among them. Refused.
 *   · A JOURNAL NONE OF WHOSE ROWS IS IN THIS DATABASE, when its run never saw
 *     this database hold one (`made.mjs` writes `{"held":…}` when it has). The
 *     rows were made in another database: a suite run by hand from the main
 *     checkout reads `rundesk_pristine` from `.env` while its `--api` is a
 *     lane's, so it made its people on the lane and swept pristine, where
 *     nothing was. The journal is moved aside (`….elsewhere`, which no run
 *     sweeps) and the line says how to sweep it where the rows are.
 *
 * BY SQL, BECAUSE THE PRODUCT HAS NO ROUTE THAT REMOVES THESE ROWS:
 *
 *   · an account: `DELETE /users/me` anonymizes the row and keeps it, and
 *     refuses the last admin of a workspace — which every person signed up is,
 *     of the personal workspace sign-up made them. No route deletes a user.
 *   · an organization: no route deletes one.
 *   · a workspace: `DELETE /workspaces/:id/permanent` deletes one for good, but
 *     only an archived one, for its organization's owner, with its name typed;
 *     its row deletion is the same `delete from workspaces where id = …` as
 *     here (and it purges the store, which this does not: see the ledger).
 *   · a space: archived by `DELETE /spaces/:id`, then deleted for good from
 *     the Trash by a workspace admin — a second route per space, and nothing
 *     a killed run's leftovers could be put through without its session.
 *
 * WHAT GOES, in this order, each step reading what the last left:
 *
 *   1. every row a journal registered by table and id (`madeRow`), spaces and
 *      workspaces among them, with everything that cascades from them;
 *   2. the organizations whose every owner is an account the run made, made
 *      since the run started — the personal organization sign-up makes, with
 *      its workspace. Never one an account from outside the run owns, and
 *      never one older than the run: the shared organizations the admin owns
 *      hold every suite's workspaces, and a run's people are members of them;
 *   3. the accounts, by id or by email, with their memberships, sessions and
 *      the rest that cascades — and before them the notifications they caused
 *      in other people's inboxes, whose `actor_id` would only be set null.
 *
 * A row that a restricting foreign key still points at cannot go; the rows
 * pointing at it are the run's own (a template its person made in the shared
 * workspace: `project_templates.created_by_id`), so they go first. Read from
 * the catalog, not listed: a table added with such a key is covered the day
 * it is added.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb, databaseUrl } from './db.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TABLE = /^[a-z][a-z0-9_]*$/
/** `<suite>.<pid>.<started>.jsonl`, and `.sweep-<pid>` while a sweep holds it. */
const NAME = /^(.+)\.(\d+)\.(\d+)\.jsonl(?:\.sweep-(\d+))?$/

/**
 * Whether the process `pid` is still the run of `script` that wrote a journal.
 * `kill(pid, 0)` answers whether any process has the number; the command line
 * whether it is still this one, since numbers come round again. A process
 * this one may not signal is somebody's, so alive. Where there is no /proc to
 * read, a live number is taken at its word: a journal kept a run too long is
 * swept by a later one, a journal swept too early deletes a live run's people.
 */
export function stillRunning(pid, script) {
  try {
    process.kill(pid, 0)
  } catch (e) {
    if (e.code === 'ESRCH') return false
  }
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(script)
  } catch {
    return true
  }
}

/**
 * A journal read: the run it names, and what that run registered. `run.started`
 * is null when neither the name nor a `{"run":{"started":…}}` line gives it —
 * never 0, which reads as a run from 1970 that every row is younger than.
 * `held`: the run saw this database hold a row it registered (`made.mjs`).
 */
export function readJournal(file) {
  const m = NAME.exec(path.basename(file))
  const run = m ? { suite: m[1], pid: Number(m[2]), started: Number(m[3]) } : { suite: path.basename(file), pid: 0, started: null }
  let held = false
  const emails = new Set()
  const accountIds = new Set()
  const rows = new Map()
  const bad = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      // The last line of a run killed mid-write; everything before it stands.
      bad.push(line.slice(0, 80))
      continue
    }
    if (e.run) {
      if (Number.isFinite(e.run.started) && e.run.started > 0) run.started = e.run.started
      continue
    }
    if (e.held) {
      held = true
      continue
    }
    if (e.t === 'users') {
      if (typeof e.email === 'string' && e.email) emails.add(e.email.toLowerCase())
      if (typeof e.id === 'string' && UUID.test(e.id)) accountIds.add(e.id)
    } else if (TABLE.test(String(e.t)) && typeof e.id === 'string' && UUID.test(e.id)) {
      if (!rows.has(e.t)) rows.set(e.t, new Set())
      rows.get(e.t).add(e.id)
    } else {
      bad.push(line.slice(0, 80))
    }
  }
  return { file, run, held, emails: [...emails], accountIds: [...accountIds], rows, bad }
}

/**
 * How many of the rows a journal names by id this database has: the accounts
 * and every registered row, read before anything is deleted. Null when they
 * could not be read. (Emails are not counted: an address is registered before
 * the account is asked for, and a refused sign-up makes none.)
 */
async function presentOf(sql, j) {
  try {
    let n = j.accountIds.length ? (await sql`select count(*)::int as n from users where id = any(${j.accountIds}::uuid[])`)[0].n : 0
    for (const [table, ids] of j.rows) {
      if (!(await sql`select to_regclass(${`public.${table}`}) is not null as ok`)[0].ok) continue
      n += (await sql`select count(*)::int as n from ${sql(table)} where id = any(${[...ids]}::uuid[])`)[0].n
    }
    return n
  } catch {
    return null
  }
}

/** Whether this database has row `id` of `table`: 0 it does, 3 it does not, 2 it could not be read. */
async function holds(table, id) {
  if (!TABLE.test(String(table)) || !UUID.test(String(id))) return 2
  let sql = null
  try {
    sql = await openDb()
    if (!sql) return 2
    if (!(await sql`select to_regclass(${`public.${table}`}) is not null as ok`)[0].ok) return 3
    return (await sql`select 1 from ${sql(table)} where id = ${id}::uuid`).length ? 0 : 3
  } catch {
    return 2
  } finally {
    await sql?.end({ timeout: 5 }).catch(() => {})
  }
}

/*
 * The rows that a restricting key (NO ACTION or RESTRICT) points at `ids` of
 * `table` from, deleted first, and theirs before them. Only single-column keys
 * to `id` exist in this schema; a table without an `id` of its own is deleted
 * from by the key alone.
 */
async function clearRestricting(sql, table, ids, depth = 0) {
  if (!ids.length || depth > 4) return
  const keys = await sql`
    select cl.relname as tbl, a.attname as col,
           exists (select 1 from pg_attribute i where i.attrelid = c.conrelid and i.attname = 'id' and not i.attisdropped) as has_id
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = to_regclass(${`public.${table}`})
      and c.confdeltype in ('a', 'r') and cardinality(c.conkey) = 1`
  for (const k of keys) {
    if (k.has_id) {
      const refs = (await sql`select id::text as id from ${sql(k.tbl)} where ${sql(k.col)} = any(${ids}::uuid[])`).map((r) => r.id)
      if (!refs.length) continue
      await clearRestricting(sql, k.tbl, refs, depth + 1)
      await sql`delete from ${sql(k.tbl)} where id = any(${refs}::uuid[])`
    } else {
      await sql`delete from ${sql(k.tbl)} where ${sql(k.col)} = any(${ids}::uuid[])`
    }
  }
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const TABLE_WORDS = {
  users: ['account', 'accounts'],
  organizations: ['organization', 'organizations'],
  workspaces: ['workspace', 'workspaces'],
  spaces: ['space', 'spaces'],
  project_templates: ['project template', 'project templates'],
  invitations: ['invitation', 'invitations'],
  forms: ['form', 'forms'],
  lists: ['list', 'lists'],
  tasks: ['task', 'tasks'],
  docs: ['doc', 'docs'],
}
const said = (table, n) => plural(n, ...(TABLE_WORDS[table] ?? [`${table} row`, `${table} rows`]))

/**
 * Remove what one journal names. `{ removed: [words], left: [words], errors }`:
 * `left` is read back after the deletes, so an error that stopped nothing is
 * not reported as a leftover, and a delete that "succeeded" on nothing is not
 * reported as a removal.
 */
export async function sweepJournal(sql, j) {
  const errors = []
  const removed = []
  const step = async (what, fn) => {
    try {
      return await fn()
    } catch (e) {
      errors.push(`${what}: ${String(e?.message ?? e).split('\n')[0]}`)
      return null
    }
  }
  const tables = [...j.rows.keys()].filter((t) => t !== 'organizations')
  // Before anything goes: which accounts are the run's, and which organizations
  // only they own — read while their memberships still say so. AN ACCOUNT OLDER
  // THAN THE RUN IS NOT THE RUN'S, whatever was registered: a suite registering
  // the admin's address by mistake, or the email of an account it did not make,
  // deletes nothing. Every account a run makes is made after it starts.
  const accounts = (await step('read the accounts', () => sql`
    select id::text as id, created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute' as ours, email from users
    where id = any(${j.accountIds}::uuid[]) or lower(email) = any(${j.emails}::text[])`)) ?? []
  const accountIds = accounts.filter((a) => a.ours).map((a) => a.id)
  const elder = accounts.filter((a) => !a.ours).map((a) => a.email)
  const owned = accountIds.length
    ? ((await step('read their organizations', () => sql`
        select o.id::text as id from organizations o
        where o.created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'
          and exists (select 1 from organization_members m
                      where m.organization_id = o.id and m.role = 'owner' and m.user_id = any(${accountIds}::uuid[]))
          and not exists (select 1 from organization_members m
                          where m.organization_id = o.id and m.role = 'owner' and not (m.user_id = any(${accountIds}::uuid[])))`)) ?? []).map((o) => o.id)
    : []
  const orgIds = [...new Set([...owned, ...(j.rows.get('organizations') ?? [])])]

  // 1. What was registered by table: other tables first, then spaces, then workspaces.
  const order = [...tables.filter((t) => t !== 'spaces' && t !== 'workspaces'), ...tables.filter((t) => t === 'spaces'), ...tables.filter((t) => t === 'workspaces')]
  for (const table of order) {
    const ids = [...j.rows.get(table)]
    const n = await step(`remove ${said(table, ids.length)}`, async () => {
      if (!(await sql`select to_regclass(${`public.${table}`}) is not null as ok`)[0].ok) throw new Error(`there is no table ${table}`)
      await clearRestricting(sql, table, ids)
      return (await sql`delete from ${sql(table)} where id = any(${ids}::uuid[])`).count
    })
    if (n) removed.push(said(table, n))
  }
  // 2. The organizations only the run's accounts own, with their workspaces.
  if (orgIds.length) {
    const inside = (await step('count their workspaces', () => sql`select count(*)::int as n from workspaces where organization_id = any(${orgIds}::uuid[])`))?.[0]?.n ?? 0
    const n = await step(`remove ${said('organizations', orgIds.length)}`, async () => {
      await clearRestricting(sql, 'organizations', orgIds)
      return (await sql`delete from organizations where id = any(${orgIds}::uuid[])`).count
    })
    if (n) removed.push(`${said('organizations', n)}${inside ? ` with ${said('workspaces', inside)}` : ''}`)
  }
  // 3. The accounts. First the notifications they caused in inboxes outside the
  // run ("… asked for access", to the admin): `actor_id` is SET NULL, so they
  // would outlive the account, about somebody who no longer exists.
  if (accountIds.length) {
    const caused = await step('remove the notifications they caused', async () =>
      (await sql`delete from notifications where actor_id = any(${accountIds}::uuid[])`).count)
    if (caused) removed.push(plural(caused, 'notification'))
    const n = await step(`remove ${said('users', accountIds.length)}`, async () => {
      await clearRestricting(sql, 'users', accountIds)
      return (await sql`delete from users where id = any(${accountIds}::uuid[])`).count
    })
    if (n) removed.unshift(said('users', n))
  }

  // What is still there, read back.
  const left = []
  const still = await step('read back the accounts', () => sql`
    select email from users
    where (id = any(${[...new Set([...j.accountIds, ...accountIds])]}::uuid[]) or lower(email) = any(${j.emails}::text[]))
      and created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'`)
  if (still?.length) left.push(`${said('users', still.length)} (${still.map((r) => r.email).join(', ')})`)
  if (elder.length) removed.push(`and kept ${said('users', elder.length)} older than the run, registered though it did not make them (${elder.join(', ')})`)
  if (orgIds.length) {
    const o = await step('read back the organizations', () => sql`select count(*)::int as n from organizations where id = any(${orgIds}::uuid[])`)
    if (o?.[0]?.n) left.push(said('organizations', o[0].n))
  }
  for (const table of order) {
    const ids = [...j.rows.get(table)]
    const r = await step(`read back the ${table}`, async () => {
      if (!(await sql`select to_regclass(${`public.${table}`}) is not null as ok`)[0].ok) return [{ n: ids.length }]
      return sql`select count(*)::int as n from ${sql(table)} where id = any(${ids}::uuid[])`
    })
    if (r?.[0]?.n) left.push(said(table, r[0].n))
  }
  if (still === null) left.push('accounts not read back')
  return { removed, left, errors }
}

const clock = (ms) => new Date(ms).toTimeString().slice(0, 8)
/** The database swept, as `host:port/name`, without its password. */
export function databaseName(url = databaseUrl()) {
  try {
    const u = new URL(url)
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`
  } catch {
    return 'the database DATABASE_URL names'
  }
}

/*
 * THE ACCOUNTS NOBODY REGISTERED. `check-suite-made-registered.mjs` reads the
 * routes a suite names; an account made through a page (a newcomer accepting
 * an invitation at /accept-invite, as `session-in-the-browser` does) names
 * none, and was left. So at the end of a run: every account made on this
 * database since the run began that no journal in `dir` names, this run's or
 * another's. Said, not failed: a run beside this one that does not register
 * (older code, a hand-run script) makes them too, and this cannot tell whose.
 */
async function unregisteredSince(sql, dir, started) {
  const emails = new Set()
  const ids = new Set()
  let names = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    /* no directory: no journal names anything */
  }
  for (const name of names) {
    if (!NAME.test(name)) continue
    try {
      const k = readJournal(path.join(dir, name))
      for (const e of k.emails) emails.add(e)
      for (const i of k.accountIds) ids.add(i)
    } catch {
      /* a journal removed while this read: its run is over, its accounts gone */
    }
  }
  return (await sql`
    select email from users
    where created_at >= to_timestamp(${started} / 1000.0)
      and not (lower(email) = any(${[...emails]}::text[])) and not (id = any(${[...ids]}::uuid[]))
    order by created_at`).map((r) => r.email)
}

async function main(argv) {
  if (argv[0] === '--holds') return holds(argv[1], argv[2])
  const ended = argv[0] === '--ended'
  const files = []
  const claimed = new Map() // claimed path -> path to put it back at
  if (ended) {
    const dir = argv[1]
    let names = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      return 0
    }
    for (const name of names) {
      const m = NAME.exec(name)
      if (!m) continue
      const [, suite, pid, , sweeper] = m
      if (Number(pid) === process.ppid) continue
      if (stillRunning(Number(pid), `${suite}.mjs`)) continue
      if (sweeper && stillRunning(Number(sweeper), 'made-sweep.mjs')) continue
      // Claimed by renaming, so two runs starting together sweep it once.
      const base = name.replace(/\.sweep-\d+$/, '')
      const mine = path.join(dir, `${base}.sweep-${process.pid}`)
      try {
        fs.renameSync(path.join(dir, name), mine)
      } catch {
        continue
      }
      files.push(mine)
      claimed.set(mine, path.join(dir, base))
    }
    if (!files.length) return 0
  } else {
    files.push(...argv)
  }

  let sql
  try {
    sql = await openDb()
  } catch (e) {
    sql = null
    console.log(`  ✗ cleanup could not open the database: ${String(e?.message ?? e).split('\n')[0]}`)
  }
  let status = 0
  const runs = []
  for (const file of files) {
    const j = readJournal(file)
    const kept = claimed.get(file) ?? file
    // NO START, NO SWEEP: the run's start is what keeps every older account and
    // organization — the admin and the organization that holds Main — out of it.
    if (!(j.run.started > 0)) {
      status = 1
      console.log(`  ✗ cleanup refused ${file}: it says no time its run started — its name is not <suite>.<pid>.<started>.jsonl and it has no {"run":{"started":…}} line — and without one an account or organization older than the run (the admin's) would be read as the run's and deleted. Nothing removed; give it a first line {"run":{"started":<ms since 1970, from before its rows were made>}}`)
      if (claimed.has(file)) fs.renameSync(file, kept)
      continue
    }
    const whose = ended
      ? `what a run of ${j.run.suite} that ended without cleaning up left (pid ${j.run.pid}, from ${clock(j.run.started)})`
      : 'what this run made'
    const empty = !j.emails.length && !j.accountIds.length && !j.rows.size
    // NONE OF IT HERE, and its run never saw this database hold any of it: made in
    // another database (DATABASE_URL is not the API's). Removing "nothing" and
    // passing would leave all of it where it was made; a run that saw this
    // database hold its first row (`held`) and removed the rest itself is fine.
    const named = j.accountIds.length + [...j.rows.values()].reduce((n, ids) => n + ids.size, 0)
    if (sql && named && !j.held && (await presentOf(sql, j)) === 0) {
      status = 1
      const aside = kept.endsWith('.elsewhere') ? kept : `${kept}.elsewhere`
      fs.renameSync(file, aside)
      console.log(`  ✗ cleanup found none of ${whose} in this database (${databaseName()}): of the ${plural(named, 'row')} it names by id, not one is here, so they were made in another database — is DATABASE_URL the API's? Nothing removed; ${aside} keeps the list (no run sweeps it); remove them where they are with DATABASE_URL=<that database> node test/e2e/lib/made-sweep.mjs ${aside}`)
      continue
    }
    runs.push({ dir: path.dirname(file), started: j.run.started })
    let result = { removed: [], left: [], errors: [] }
    if (!empty) {
      if (!sql) result.left.push('everything it names (no database)')
      else result = await sweepJournal(sql, j)
    }
    if (result.left.length) {
      status = 1
      console.log(`  ✗ cleanup left behind ${whose}: ${result.left.join(', ')}${result.errors.length ? ` — ${result.errors.join('; ')}` : ''}`)
      console.log(`    (${claimed.get(file) ?? file} keeps the list; the next run on this database tries again)`)
      if (claimed.has(file)) fs.renameSync(file, claimed.get(file))
      continue
    }
    if (!empty) console.log(`  (removed ${whose}: ${result.removed.length ? result.removed.join(', ') : 'nothing was left of it'})`)
    if (j.bad.length) console.log(`    (and passed over ${j.bad.length} unreadable line(s) of its journal: ${j.bad[0]}…)`)
    fs.rmSync(file, { force: true })
  }
  if (!ended && sql) {
    for (const { dir, started } of runs) {
      const nobody = await unregisteredSince(sql, dir, started).catch(() => [])
      if (nobody.length) {
        console.log(`  ! ${plural(nobody.length, 'account was', 'accounts were')} made on this database while this run ran that no run registered, and stay: ${nobody.join(', ')}` +
          ' — if this run made them (through a page, say), register them with madeAccount({ email }) before they are made (lib/made.mjs)')
      }
    }
  }
  await sql?.end({ timeout: 5 }).catch(() => {})
  return status
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
