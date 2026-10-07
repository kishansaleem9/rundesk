#!/usr/bin/env node
/**
 * WHAT RUNS LEFT ON A LANE BEFORE THE SWEEP EXISTED
 * (`found-30-sep/lanes-hold-earlier-runs-leftovers`).
 *
 *   node scripts/e2e-lanes/lane-leftovers.mjs <k>…            count, lane by lane
 *   node scripts/e2e-lanes/lane-leftovers.mjs <k>… --remove   count, remove, count again
 *
 * `made-sweep.mjs` removes what a run's journal names, from the day it went
 * in; what runs made before then stayed. On 30 September lane 6 held 651
 * `@rundesk.invalid` accounts and 389 archived workspaces; on 5 October lane 1
 * held 3,175 accounts and 1,195 archived workspaces, and 364 of Main's 388
 * spaces were archived.
 *
 * WHAT A RUN MADE is what `rundesk_pristine`, the dump every lane is restored
 * from, does not have, by id. Pristine holds the two admins, Rundesk HQ, Main
 * Workspace, its General space and its To do list, and nothing else, so every
 * other account, organization, workspace, space and list on a lane was made by
 * a run, archived or not, whoever owns it now. The first rule taken was
 * narrower — the accounts at `@rundesk.invalid` with the organizations only
 * they own, and what was archived — and on lane 1 it left eight organizations
 * runs had made: six whose owners were already gone, one of an account a
 * suite signed up at `@rundesk.internal`, and one the admin owns, holding 643
 * live workspaces named by their suites (`gcm…`, `lpl…`, `rpw-…`). So all of
 * them. What is inside pristine's own list and workspace (a task, a doc) is
 * taken too since `found-30-sep/suite-leftovers-unmeasured`.
 *
 * AND PRISTINE'S OWN ROWS, AS PRISTINE HAS THEM (`found-7-oct/shared-rows-keep-what-runs-changed`).
 * A run that changes a value on a row every run shares — the admin's
 * settings, Main's, General's — and does not put it back leaves the lane
 * unlike pristine without making a row: lane 7's admin held a planner rail
 * without "Meet with", from an earlier run, and `calendar-accounts`, which
 * looks for it, failed there and nowhere else. So each of pristine's rows, in
 * every table these read, is compared with pristine's, said when it differs,
 * and with `--remove` written back as pristine has it. One pristine has that
 * the lane does not is said, not made again: what pointed at it is gone.
 *
 * It removes them as the sweep removes a run's (`sweepJournal`): the rows a
 * restricting key points at first, the notifications the accounts caused, and
 * what the store held for the workspaces and accounts.
 *
 * Only a lane's database, `rundesk_v<k>`, and only while no suite runs on the
 * lane: a running suite's rows are its own until it ends.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const HERE = import.meta.dirname
const E2E_LIB = path.join(HERE, '..', '..', 'test', 'e2e', 'lib')
const { openDb } = await import(pathToFileURL(path.join(E2E_LIB, 'db.mjs')).href)
const { sweepJournal, LEFT_BY_USE } = await import(pathToFileURL(path.join(E2E_LIB, 'made-sweep.mjs')).href)

const args = process.argv.slice(2)
const remove = args.includes('--remove')
const lanes = args.filter((a) => /^\d+$/.test(a)).map(Number)
if (!lanes.length || args.some((a) => a !== '--remove' && !/^\d+$/.test(a))) {
  console.log('usage: node scripts/e2e-lanes/lane-leftovers.mjs <lane>… [--remove]')
  process.exit(2)
}
const urlOf = (db) => `postgres://rundesk:rundesk@127.0.0.1:5432/${db}`
const open = async (db) => {
  process.env.DATABASE_URL = urlOf(db)
  const sql = await openDb()
  if (!sql) throw new Error(`could not open ${db}`)
  return sql
}

/** What pristine has, by table: every id a lane is restored with, and the latest moment one was made. */
const pristine = await open('rundesk_pristine')
const seed = {}
let seededUntil = 0
for (const t of ['users', 'organizations', 'workspaces', 'spaces', 'lists']) {
  const rows = await pristine`select id::text as id, extract(epoch from created_at) * 1000 as at from ${pristine(t)}`
  seed[t] = rows.map((r) => r.id)
  for (const r of rows) seededUntil = Math.max(seededUntil, Number(r.at))
}
/*
 * AND WHAT RUNS MADE INSIDE PRISTINE'S OWN CONTAINERS (`found-30-sep/suite-leftovers-unmeasured`):
 * a task in General › To do, a direct message in Main, a meeting, a
 * notification in the admin's inbox. Every other table with an id of its own,
 * but those using the product as somebody fills (`LEFT_BY_USE`: sessions,
 * counters, the AI limit's calls, the audit trail). A run that found such a
 * row reused it — a direct message, a fixture task — and what it added to it
 * stayed, which nothing could register.
 */
const containers = Object.keys(seed)
const inside = (await pristine`
  select c.table_name as t from information_schema.columns c
  join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
  where c.table_schema = 'public' and c.column_name = 'id' and c.data_type = 'uuid'
  order by 1`).map((r) => r.t).filter((t) => !containers.includes(t) && !(t in LEFT_BY_USE))
for (const t of inside) seed[t] = (await pristine`select id::text as id from ${pristine(t)}`).map((r) => r.id)
/*
 * BUT WHAT THE API WRITES FOR ITSELF: its built-in project templates, written
 * as it starts when its database lacks one, and their facets set to the
 * catalog's (`ensureBuiltIns`). Pristine was dumped before the last five were
 * added and before the facets were set, so every lane's API wrote them;
 * removing them took them from the Template Center until the API started
 * again, and writing pristine's facets back left the five it had without a
 * category until then.
 */
const OWN = { project_templates: (sql) => sql`and not is_built_in` }
const own = (sql, t) => (OWN[t] ? OWN[t](sql) : sql``)

/** Pristine's rows by table, as JSON by id, with the columns a write can set (none generated). */
const asSeeded = {}
const writable = {}
for (const t of [...containers, ...inside]) {
  writable[t] = (await pristine`
    select column_name as c from information_schema.columns
    where table_schema = 'public' and table_name = ${t} and column_name <> 'id' and is_generated = 'NEVER'
      and coalesce(identity_generation, '') <> 'ALWAYS'
    order by ordinal_position`).map((r) => r.c)
  asSeeded[t] = new Map((await pristine`select id::text as id, to_jsonb(x) as row from ${pristine(t)} x where true ${own(pristine, t)}`).map((r) => [r.id, r.row]))
}
await pristine.end({ timeout: 5 })

/** Pristine's rows this lane holds otherwise, by table: changed ones and missing ones. */
const unlikePristine = async (sql) => {
  const changed = {}
  const missing = {}
  for (const [t, rows] of Object.entries(asSeeded)) {
    if (!rows.size) continue
    const here = new Map((await sql`select id::text as id, to_jsonb(x) as row from ${sql(t)} x where id = any(${[...rows.keys()]}::uuid[])`).map((r) => [r.id, r.row]))
    for (const [id, row] of rows) {
      if (!here.has(id)) (missing[t] ??= []).push(id)
      else if (JSON.stringify(here.get(id)) !== JSON.stringify(row)) (changed[t] ??= []).push(id)
    }
  }
  return { changed, missing }
}
const countsOf = (byTable) => Object.fromEntries(Object.entries(byTable).map(([t, ids]) => [t, ids.length]))

/** The counts this is about, read the same way before and after: what pristine does not have, and of it what is archived. */
const count = async (sql) => {
  const [c] = await sql`
    select
      (select count(*)::int from users where not (id = any(${seed.users}::uuid[]))) as accounts,
      (select count(*)::int from users where email like '%@rundesk.invalid') as "at @rundesk.invalid",
      (select count(*)::int from organizations where not (id = any(${seed.organizations}::uuid[]))) as organizations,
      (select count(*)::int from workspaces where not (id = any(${seed.workspaces}::uuid[]))) as workspaces,
      (select count(*)::int from workspaces where is_archived) as "archived workspaces",
      (select count(*)::int from spaces where not (id = any(${seed.spaces}::uuid[]))) as spaces,
      (select count(*)::int from spaces where is_archived) as "archived spaces",
      (select count(*)::int from lists where not (id = any(${seed.lists}::uuid[]))) as lists,
      (select count(*)::int from lists where is_archived) as "archived lists",
      (select count(*)::int from spaces s where s.workspace_id = ${seed.workspaces[0]}::uuid) as "Main's spaces"`
  return c
}
/** The rows pristine does not have inside its containers, by table: only the tables that hold some. */
const insideCount = async (sql) => {
  const held = {}
  for (const t of inside) {
    const [{ n }] = await sql`select count(*)::int as n from ${sql(t)} where not (id = any(${seed[t]}::uuid[])) ${own(sql, t)}`
    if (n) held[t] = n
  }
  return held
}
const said = (c) => Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ')

let status = 0
for (const k of lanes) {
  const db = `rundesk_v${k}`
  // A suite running on the lane, or a run of verify.sh for it: its rows are its own.
  const ps = execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' }).split('\n')
  const busy = ps.filter((a) => a.includes(`--api ${3020 + k}`) || new RegExp(`verify\\.sh \\S+ ${k}$`).test(a.trim()))
  if (busy.length) {
    console.log(`lane ${k}: a suite is running on it — left as it is (${busy[0].slice(0, 120)})`)
    status = 1
    continue
  }
  const sql = await open(db)
  try {
    const before = await count(sql)
    const insideBefore = await insideCount(sql)
    console.log(`lane ${k} (${db}), before: ${said(before)}`)
    console.log(`lane ${k}, inside pristine's containers, before: ${said(insideBefore) || 'nothing pristine lacks'}`)
    const unlike = await unlikePristine(sql)
    console.log(`lane ${k}, pristine's own rows changed: ${said(countsOf(unlike.changed)) || 'none'}${Object.keys(unlike.missing).length ? `; missing: ${said(countsOf(unlike.missing))}` : ''}`)
    if (!remove) continue
    const notSeeded = async (t) => (await sql`
      select id::text as id from ${sql(t)} where not (id = any(${seed[t]}::uuid[])) ${own(sql, t)}`).map((r) => r.id)
    const accountIds = await notSeeded('users')
    const rows = new Map([
      ['organizations', new Set(await notSeeded('organizations'))],
      ['workspaces', new Set(await notSeeded('workspaces'))],
      ['spaces', new Set(await notSeeded('spaces'))],
      ['lists', new Set(await notSeeded('lists'))],
    ])
    for (const t of Object.keys(insideBefore)) rows.set(t, new Set(await notSeeded(t)))
    for (const [t, ids] of rows) if (!ids.size) rows.delete(t)
    // The sweep's age rule, from just after pristine's last row: nothing pristine made is "the run's".
    const run = { suite: 'lane-leftovers', pid: process.pid, started: seededUntil + 2 * 60_000 }
    const result = await sweepJournal(sql, { run, held: true, emails: [], accountIds, rows, bad: [] })
    // Pristine's own rows written back as pristine has them.
    for (const [t, ids] of Object.entries(unlike.changed)) {
      const cols = writable[t]
      for (const id of ids) {
        await sql`
          update ${sql(t)} set (${sql(cols)}) = (select ${sql(cols)} from jsonb_populate_record(null::${sql(t)}, ${asSeeded[t].get(id)}::jsonb))
          where id = ${id}::uuid`
      }
    }
    const after = await count(sql)
    const insideAfter = await insideCount(sql)
    const unlikeAfter = await unlikePristine(sql)
    console.log(`lane ${k}, pristine's own rows written back: ${said(countsOf(unlike.changed)) || 'none'}; changed after: ${said(countsOf(unlikeAfter.changed)) || 'none'}`)
    if (Object.keys(unlikeAfter.changed).length) status = 1
    console.log(`lane ${k}, removed: ${result.removed.join(', ') || 'nothing'}`)
    console.log(`lane ${k}, after: ${said(after)}`)
    console.log(`lane ${k}, inside pristine's containers, after: ${said(insideAfter) || 'nothing pristine lacks'}`)
    if (Object.keys(insideAfter).length) status = 1
    if (result.left.length || result.errors.length) {
      status = 1
      console.log(`lane ${k}: left ${result.left.join(', ') || 'nothing'}${result.errors.length ? ` — ${result.errors.join('; ')}` : ''}`)
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {})
  }
}
process.exitCode = status
