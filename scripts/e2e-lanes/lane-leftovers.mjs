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
 * not taken here: `found-30-sep/suite-leftovers-unmeasured` counts it.
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
const { sweepJournal } = await import(pathToFileURL(path.join(E2E_LIB, 'made-sweep.mjs')).href)

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
await pristine.end({ timeout: 5 })

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
    console.log(`lane ${k} (${db}), before: ${said(before)}`)
    if (!remove) continue
    const notSeeded = async (t) => (await sql`
      select id::text as id from ${sql(t)} where not (id = any(${seed[t]}::uuid[]))`).map((r) => r.id)
    const accountIds = await notSeeded('users')
    const rows = new Map([
      ['organizations', new Set(await notSeeded('organizations'))],
      ['workspaces', new Set(await notSeeded('workspaces'))],
      ['spaces', new Set(await notSeeded('spaces'))],
      ['lists', new Set(await notSeeded('lists'))],
    ])
    for (const [t, ids] of rows) if (!ids.size) rows.delete(t)
    // The sweep's age rule, from just after pristine's last row: nothing pristine made is "the run's".
    const run = { suite: 'lane-leftovers', pid: process.pid, started: seededUntil + 2 * 60_000 }
    const result = await sweepJournal(sql, { run, held: true, emails: [], accountIds, rows, bad: [] })
    const after = await count(sql)
    console.log(`lane ${k}, removed: ${result.removed.join(', ') || 'nothing'}`)
    console.log(`lane ${k}, after: ${said(after)}`)
    if (result.left.length || result.errors.length) {
      status = 1
      console.log(`lane ${k}: left ${result.left.join(', ') || 'nothing'}${result.errors.length ? ` — ${result.errors.join('; ')}` : ''}`)
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {})
  }
}
process.exitCode = status
