/**
 * WHAT A RUN MADE, AND ITS REMOVAL: ONE MECHANISM FOR EVERY SUITE
 * (`found-30-sep/suite-runs-leave-accounts-behind`,
 * `found-30-sep/killed-suites-leave-members-behind`).
 *
 * Measured on lane 6, 30 September, one clean run each: `template-center` left
 * the two people it signs up, with their organizations and personal
 * workspaces, and its applied space archived in the shared Main Workspace;
 * `project-template-key`, `like-literal` and `role-permissions-web` left their
 * people and their own workspace, archived; `space-default-permission` its
 * person and five archived spaces in Main; `space-create-menu` one. The lane
 * held 651 `@rundesk.invalid` accounts, 389 archived workspaces and 153
 * archived spaces in Main out of 164. A suite's `finally` archived what the
 * product lets it archive and removed members; nothing removed a person, and a
 * run killed before its `finally` (the break runner's `timeout`, its reaper's
 * SIGKILL) removed nothing at all.
 *
 * REGISTER what is made, as it is made:
 *
 *   · `madeAccount({ email })` BEFORE asking for the account, and again with
 *     `{ id }` once it exists. `signUpApi` does both for every person a suite
 *     signs up, so a suite calls it itself only for an account made another
 *     way (a raw `/auth/signup` sent from a chosen address, an invitation
 *     claimed into a new account). `scripts/check-suite-made-registered.mjs`
 *     refuses a suite that makes one and does neither.
 *   · `madeWorkspace(id)`, `madeSpace(id)`, `madeRow(table, id)` once the id is
 *     known. `apiAs` in `fixture.mjs` registers every workspace and space the
 *     API says it made (`POST /workspaces`, `POST /spaces`); anything else —
 *     a space a template applied, a template in the shared workspace — is
 *     registered by the suite that made it.
 *
 * THE JOURNAL IS THE TAG. Each registration is appended, synchronously, to
 * `<dir>/<database>/<suite>.<pid>.<started>.jsonl` before the call that made it
 * returns (`E2E_MADE_DIR`, else `rundesk-e2e-made` under the OS temp dir). So
 * a run killed a line later has already said what it made, and the file names
 * the process that made it. A name pattern could not do this: `tc-%` is also
 * the next run of the same suite, running now on another lane's worktree
 * against this database. A process that is gone cannot be.
 *
 * REMOVAL, BY SQL (`made-sweep.mjs`, which says why the product's routes do
 * not do it):
 *
 *   · AT EXIT: when the process ends in any way Node still runs `exit` for —
 *     the script ending, `process.exit`, an uncaught throw — the sweep runs on
 *     this run's journal, synchronously (`exit` runs nothing asynchronous),
 *     prints one line saying what it removed, and removes the journal. If any
 *     row it names is still there, it says which and the run exits 1: a run
 *     that leaves rows it made is not a clean run.
 *   · AT THE START OF THE NEXT RUN: a run killed where `exit` does not run
 *     (SIGKILL; SIGTERM, which nothing here catches) leaves its journal. The
 *     first registration of any later run on the same database sweeps every
 *     journal whose process is gone, before it makes anything.
 *
 * `E2E_KEEP_MADE=1` keeps what a run made, to read after a failure; the next
 * run on the same database removes it.
 *
 * THE DATABASE IT CLEANS MUST BE THE ONE ITS ROWS ARE MADE IN. The sweep reads
 * `DATABASE_URL`, else the checkout's `.env`; the API reads its own. Run by hand
 * from the main checkout against a lane (`--api 3011`), a suite made its people
 * on the lane, journaled them under `rundesk_pristine` (the main `.env`), swept
 * pristine, found nothing, and said "nothing was left of it". So the first id a
 * run registers — a row made a moment ago — is looked up where the sweep will
 * look: if that database does not have it, the run says so and stops there
 * (the registration throws), its journal is moved aside (`….elsewhere`, which
 * no run sweeps) with what it goes on to register, and the run exits 1 saying
 * how to sweep it where the rows are. When it does have it, the journal says so
 * (`{"held":…}`); a journal that does not, none of whose rows the sweep finds,
 * is refused the same way (`made-sweep.mjs`).
 *
 * With no database to reach (no `DATABASE_URL` and no `.env`) nothing can be
 * removed, and the run says what it leaves instead of saying nothing.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { databaseUrl } from './db.mjs'
import { databaseName } from './made-sweep.mjs'

// `MADE_SWEEP_UNDER_TEST`: `scripts/check-made-sweep.mjs --mutate` aims a run at a broken copy.
const SWEEPER = process.env.MADE_SWEEP_UNDER_TEST || path.join(import.meta.dirname, 'made-sweep.mjs')
/** The suite's name, as `<name>.mjs` appears in its command line. */
export const SUITE = path.basename(process.argv[1] ?? 'unnamed', '.mjs').replace(/[^A-Za-z0-9_-]+/g, '-') || 'unnamed'
const STARTED = Date.now()

/**
 * The journals of one database: `E2E_MADE_DIR` (else `rundesk-e2e-made` under
 * the OS temp dir), then `<host>_<port>_<database>`. Null when there is no
 * database to clean: nothing is journaled that nothing could sweep.
 */
export function journalDir(url = databaseUrl()) {
  if (!url) return null
  let key = url
  try {
    const u = new URL(url)
    key = `${u.hostname}_${u.port || '5432'}_${u.pathname.replace(/^\//, '')}`
  } catch {
    /* not a URL: the string itself, made a file name */
  }
  const root = process.env.E2E_MADE_DIR || path.join(os.tmpdir(), 'rundesk-e2e-made')
  return path.join(root, key.replace(/[^A-Za-z0-9._-]+/g, '-'))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TABLE = /^[a-z][a-z0-9_]*$/

/** What this run registered, counted for the line said when nothing can remove it. */
const counted = new Map()
let journal = null
let armed = false
let dbUrl = null
/** Whether the first id registered was looked up in the database the sweep reads. */
let placed = false
/** The first id registered, when that database did not have it. */
let elsewhere = null

/** Run the sweeper and wait for it: at exit nothing asynchronous runs. */
function runSweeper(args, url) {
  return spawnSync(process.execPath, [SWEEPER, ...args], {
    stdio: 'inherit',
    timeout: 120_000,
    env: { ...process.env, DATABASE_URL: url },
  })
}

/*
 * On the first registration: sweep what runs that are gone left on this
 * database, open this run's journal, and hook the exit. Not at import: a gate
 * that imports `fixture.mjs` to read its code makes nothing and should touch
 * nothing.
 */
function arm() {
  if (armed) return
  armed = true
  const url = (dbUrl = databaseUrl())
  const dir = journalDir(url)
  if (dir) {
    fs.mkdirSync(dir, { recursive: true })
    const swept = runSweeper(['--ended', dir], url)
    if (swept.status !== 0) {
      console.log(`  (what earlier runs left on this database is not all removed: the sweep ${swept.error ? `did not run (${swept.error.message})` : `exited ${swept.status}`}; this run goes on)`)
    }
    journal = path.join(dir, `${SUITE}.${process.pid}.${STARTED}.jsonl`)
    fs.appendFileSync(journal, `${JSON.stringify({ run: { suite: SUITE, pid: process.pid, started: STARTED } })}\n`)
  }
  process.on('exit', () => removeAtExit(url))
}

function removeAtExit(url) {
  if (elsewhere) {
    console.log(`  ✗ cleanup removed nothing: what this run made is in another database than ${databaseName(url)} — ${journal} lists it; remove it with DATABASE_URL=<the API's database> node test/e2e/lib/made-sweep.mjs ${journal}`)
    process.exitCode ||= 1
    return
  }
  if (!journal) {
    // Armed as the suite began (no database to read): nothing made, nothing to say.
    if (!counted.size) return
    const what = [...counted].map(([t, n]) => `${n} ${t}`).join(', ')
    console.log(`  (made by this run and NOT removed — there is no DATABASE_URL to remove it through: ${what})`)
    return
  }
  if (process.env.E2E_KEEP_MADE === '1') {
    console.log(`  (E2E_KEEP_MADE: kept what this run made, listed in ${journal}; the next run on this database removes it)`)
    return
  }
  const r = runSweeper(['--exit', journal], url)
  if (r.status !== 0) {
    if (r.error) console.log(`  ✗ cleanup did not run: ${r.error.message}; ${journal} keeps the list for the next run`)
    // A run that leaves what it made is not clean, whatever its checks said.
    if (!process.exitCode) process.exitCode = 1
  }
}

function record(entry) {
  arm()
  counted.set(entry.t, (counted.get(entry.t) ?? 0) + 1)
  if (journal) fs.appendFileSync(journal, `${JSON.stringify(entry)}\n`)
  if (journal && entry.id && !placed) checkPlace(entry)
}

/*
 * The first id registered, looked up where the sweep will look (see the head of
 * this file). Once a run: `--holds` is a process of its own, since this is
 * synchronous. A database that could not be read says nothing here; the sweep
 * at the exit says what it could not reach.
 */
function checkPlace(entry) {
  placed = true
  const r = runSweeper(['--holds', entry.t, entry.id], dbUrl)
  if (r.status === 0) {
    fs.appendFileSync(journal, `${JSON.stringify({ held: { t: entry.t, id: entry.id } })}\n`)
    return
  }
  if (r.status !== 3) return
  elsewhere = entry
  const aside = `${journal}.elsewhere`
  try {
    fs.renameSync(journal, aside)
    journal = aside
  } catch {
    /* left where it was: the exit says where */
  }
  const why = `${databaseName(dbUrl)}, the database this run cleans, has no ${entry.t} row ${entry.id}, made a moment ago: this run's rows are made in another database (the API's), where nothing it makes could be removed. Set DATABASE_URL to the database the API uses (a lane's is rundesk_v<k>)`
  console.log(`  ✗ ${why}`)
  throw new Error(why)
}

/**
 * An account this run makes, or has made: by `email` before it is asked for,
 * so a run killed while the answer is on its way has still said whose it is,
 * and by `id` once it exists. Its organizations go with it where it is their
 * only owner; its memberships, sessions and everything else that is its own
 * cascade.
 */
export function madeAccount({ email, id } = {}) {
  const e = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const i = typeof id === 'string' && UUID.test(id) ? id : ''
  if (!e && !i) throw new Error(`madeAccount needs the email or the id of the account: got ${JSON.stringify({ email, id })}`)
  record({ t: 'users', ...(e ? { email: e } : {}), ...(i ? { id: i } : {}) })
}

/** A row of `table` this run made, removed by id with what hangs off it. */
export function madeRow(table, id) {
  if (!TABLE.test(String(table))) throw new Error(`madeRow: ${JSON.stringify(table)} is not a table name`)
  if (typeof id !== 'string' || !UUID.test(id)) throw new Error(`madeRow(${table}): ${JSON.stringify(id)} is not an id`)
  if (table === 'users') return madeAccount({ id })
  record({ t: table, id })
}

/** A workspace this run made, removed for good (archiving keeps it). */
export const madeWorkspace = (id) => madeRow('workspaces', id)
/** A space this run made, removed for good (archiving keeps it). */
export const madeSpace = (id) => madeRow('spaces', id)

/*
 * A SUITE'S RUN IS ARMED AS IT BEGINS, whether it registers anything or not:
 * the end of the run reads what it left that nothing registered, and a suite
 * that registered nothing left most of all (`made-sweep.mjs`'s `leftSince`,
 * `found-30-sep/suite-leftovers-unmeasured`). A suite is a script in
 * `test/e2e/` itself; a gate that imports this to read it is not, and touches
 * nothing.
 */
if (/[\\/]test[\\/]e2e[\\/][^\\/]+\.mjs$/.test(path.resolve(process.argv[1] ?? ''))) arm()
