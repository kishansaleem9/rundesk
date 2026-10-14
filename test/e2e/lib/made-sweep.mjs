#!/usr/bin/env node
/**
 * REMOVE WHAT A RUN'S JOURNAL NAMES (`made.mjs` writes the journals and runs
 * this; `found-30-sep/suite-runs-leave-accounts-behind`,
 * `found-30-sep/killed-suites-leave-members-behind`).
 *
 *   node test/e2e/lib/made-sweep.mjs --exit <journal>
 *                                                    a run's own end (made.mjs):
 *                                                    its journal, and then what
 *                                                    it left that nothing
 *                                                    registered (`leftSince`)
 *   node test/e2e/lib/made-sweep.mjs <journal>…      these journals, by hand
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
 *
 * AND THEN WHAT THE STORE HELD FOR THEM (`found-30-sep/suite-cleanup-leaves-stored-objects`).
 * The rows went and the objects they named stayed: `stable-images` left the
 * avatar and the logo of an account and a workspace that no longer existed.
 * So, read before the rows go, as `WorkspacesService.storedKeysOf` reads a
 * workspace deleted for good: for each workspace this removes, the keys its
 * rows name and the prefixes it owns, `avatars/<id>-` for each account, and
 * the files and cover of each task it removes from a workspace that stays;
 * deleted once the rows are gone, and listed again. Only from a stub: the
 * lane's (`91<k>`, bucket `rundesk-v<k>`, for the database `rundesk_v<k>`) or
 * the one `E2E_STORE_PORT` and `E2E_STORE_BUCKET` name, which must answer as
 * the stub does (`/__control/version`); any other store is said and left.
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
  const shared = []
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
    if (e.shared) {
      // A shared row the run said it changes: put back as found when it ends (`changesShared`).
      if (TABLE.test(String(e.shared.t)) && Array.isArray(e.shared.cols) && e.shared.cols.every((c) => TABLE.test(String(c)))) shared.push(e.shared)
      else bad.push(line.slice(0, 80))
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
  return { file, run, held, emails: [...emails], accountIds: [...accountIds], rows, shared, bad }
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

/**
 * The object store of the database swept: `E2E_STORE_PORT` and
 * `E2E_STORE_BUCKET` (CI's), else the lane's — `rundesk_v<k>` keeps its
 * objects in bucket `rundesk-v<k>` on port 91<k> (`lane_store_env`,
 * lane-env.sh). Null when neither says.
 */
export function storeOf(url = databaseUrl(), env = process.env) {
  if (env.E2E_STORE_PORT && env.E2E_STORE_BUCKET) {
    return { base: `http://127.0.0.1:${Number(env.E2E_STORE_PORT)}`, bucket: env.E2E_STORE_BUCKET }
  }
  let name = ''
  try {
    name = new URL(url).pathname.slice(1)
  } catch {
    return null
  }
  const lane = /^rundesk_v(\d+)$/.exec(name)
  return lane ? { base: `http://127.0.0.1:${9100 + Number(lane[1])}`, bucket: `rundesk-v${lane[1]}` } : null
}

/*
 * What the store holds for the workspaces and accounts a sweep removes, read
 * before their rows go: `WorkspacesService.storedKeysOf`'s keys and prefixes
 * for each workspace — registered, or in an organization the sweep removes —
 * and `avatars/<id>-` for each account (`UsersService`'s avatar keys).
 */
async function storedOf(sql, workspaceIds, orgIds, accountIds, taskIds = []) {
  const ws = (await sql`
    select id::text as id from workspaces
    where id = any(${workspaceIds}::uuid[]) or organization_id = any(${orgIds}::uuid[])`).map((r) => r.id)
  const keys = ws.length
    ? (await sql`
        select ta.storage_key as k from task_attachments ta
          join tasks t on t.id = ta.task_id join lists l on l.id = t.list_id
          join projects p on p.id = l.project_id join spaces s on s.id = p.space_id
          where s.workspace_id = any(${ws}::uuid[])
        union select t.cover_storage_key from tasks t join lists l on l.id = t.list_id
          join projects p on p.id = l.project_id join spaces s on s.id = p.space_id
          where s.workspace_id = any(${ws}::uuid[]) and t.cover_storage_key is not null
        union select ca.storage_key from chat_message_attachments ca join chat_channels c on c.id = ca.channel_id
          where c.workspace_id = any(${ws}::uuid[])
        union select e.storage_key from chat_custom_emoji e where e.workspace_id = any(${ws}::uuid[]) and e.storage_key is not null
        union select cr.storage_key from call_recordings cr join calls c on c.id = cr.call_id where c.workspace_id = any(${ws}::uuid[])
        union select c.recording_storage_key from calls c where c.workspace_id = any(${ws}::uuid[]) and c.recording_storage_key is not null`)
        .map((r) => r.k)
        .filter(Boolean)
    : []
  // And the files and covers of the tasks it removes in a workspace that stays
  // (Main's), when no other task names the same object (a copy may).
  if (taskIds.length) {
    keys.push(...(await sql`
      with k as (
        select storage_key as k from task_attachments where task_id = any(${taskIds}::uuid[])
        union select cover_storage_key from tasks where id = any(${taskIds}::uuid[]) and cover_storage_key is not null)
      select k.k from k
      where not exists (select 1 from task_attachments o where o.storage_key = k.k and not (o.task_id = any(${taskIds}::uuid[])))
        and not exists (select 1 from tasks o where o.cover_storage_key = k.k and not (o.id = any(${taskIds}::uuid[])))`)
      .map((r) => r.k)
      .filter(Boolean))
  }
  const prefixes = [
    ...ws.flatMap((id) => [`workspaces/${id}/`, `calls/${id}/`, `chat/${id}/`, `workspace-logos/${id}-`]),
    ...accountIds.map((id) => `avatars/${id}-`),
  ]
  return { keys, prefixes }
}

const keyPath = (store, key) => `${store.base}/${store.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** Every key under `prefix`, page by page, as ListObjectsV2 answers. Throws when the store does not answer. */
async function listKeys(store, prefix) {
  const keys = []
  let token = null
  for (let page = 0; page < 1000; page += 1) {
    const q = new URLSearchParams({ 'list-type': '2', prefix, 'max-keys': '1000', ...(token ? { 'continuation-token': token } : {}) })
    const res = await fetch(`${store.base}/${store.bucket}?${q}`)
    if (!res.ok) throw new Error(`listing ${prefix} answered ${res.status}`)
    const body = await res.text()
    for (const m of body.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(unescapeXml(m[1]))
    token = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(body)?.[1] ?? null
    if (!token) break
    token = unescapeXml(token)
  }
  return keys
}

/** Whether `key` is in the store (a HEAD answering 200). */
const stored = async (store, key) => (await fetch(keyPath(store, key), { method: 'HEAD' })).status === 200

/**
 * Delete what `storedOf` read: every key under its prefixes, and each of its
 * keys the store has. `{ removed, left, unsaid }`: `left` is listed again
 * after the deletes; `unsaid` says why nothing was asked of the store.
 */
async function purgeStored({ keys, prefixes }, store) {
  if (!keys.length && !prefixes.length) return { removed: 0, left: 0, unsaid: null }
  // No store known: a database with none beside it (a gate's, a laptop's) has had nothing uploaded for it.
  if (!store) return { removed: 0, left: 0, unsaid: null }
  const stub = await fetch(`${store.base}/__control/version`)
    .then((r) => (r.ok ? r.json() : null))
    .then((b) => typeof b?.source === 'string', () => false)
  if (!stub) return { removed: 0, left: 0, unsaid: `the store at ${store.base} did not answer as the stub does, and only the stub's objects are removed` }
  // Under its prefixes: listed one by one, or, for many, the bucket listed once and read through.
  const underPrefixes = async () => {
    if (prefixes.length <= 20) return (await Promise.all(prefixes.map((p) => listKeys(store, p)))).flat()
    return (await listKeys(store, '')).filter((k) => prefixes.some((p) => k.startsWith(p)))
  }
  const outside = keys.filter((k) => !prefixes.some((p) => k.startsWith(p)))
  const present = new Set(await underPrefixes())
  for (const k of outside) if (await stored(store, k)) present.add(k)
  for (const k of present) await fetch(keyPath(store, k), { method: 'DELETE' })
  let left = (await underPrefixes()).length
  for (const k of outside) if (await stored(store, k)) left += 1
  return { removed: present.size - left, left, unsaid: null }
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
  /*
   * WHAT A REGISTERED ROW FILED ELSEWHERE, which its key does not take with it
   * (`found-30-sep/suite-leftovers-unmeasured`): a call that ends files a
   * meeting, and the server can end it with no answer anybody registered (the
   * browser left the page); a form's submission files a task, whose link to
   * it is set null when the form goes; a task or a list has mail in and out,
   * whose link is set null too; a task made with tags typed by name
   * makes each tag it did not find, and answers with the task; a list made
   * straight under a space is filed in a project the server makes for it. A
   * label or a project is shared, so only one made since the run began is
   * taken.
   */
  const filedBy = async (what, table, read) => {
    const filed = (await step(`read the ${what}`, read)) ?? []
    if (!filed.length) return
    if (!j.rows.has(table)) j.rows.set(table, new Set())
    for (const r of filed) j.rows.get(table).add(r.id)
  }
  if (j.rows.has('calls')) {
    await filedBy('meetings their calls filed', 'meetings', () => sql`
      select meeting_id::text as id from calls where id = any(${[...j.rows.get('calls')]}::uuid[]) and meeting_id is not null`)
  }
  if (j.rows.has('forms')) {
    await filedBy('tasks their forms filed', 'tasks', () => sql`
      select created_task_id::text as id from form_submissions where form_id = any(${[...j.rows.get('forms')]}::uuid[]) and created_task_id is not null`)
  }
  if (j.rows.has('lists')) {
    await filedBy('projects their lists were filed in', 'projects', () => sql`
      select distinct p.id::text as id from projects p join lists l on l.project_id = p.id
      where l.id = any(${[...j.rows.get('lists')]}::uuid[]) and p.created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'`)
  }
  // The mail in and out of a task or list that goes: its key to them is set null as they go, so it is read first.
  // Mail refused names neither, and is read by its address: a list's (revoked), or a task's (`list-…+task-<id>@`).
  if (j.rows.has('tasks') || j.rows.has('lists') || j.rows.has('list_email_aliases')) {
    const named = (t) => [...(j.rows.get(t) ?? [])]
    await filedBy('mail in about them', 'inbound_email_messages', () => sql`
      select id::text as id from inbound_email_messages
      where task_id = any(${named('tasks')}::uuid[]) or list_id = any(${named('lists')}::uuid[])
         or lower(split_part(split_part(recipient, '@', 1), '+', 1)) in (
           select lower(local_part) from list_email_aliases
           where list_id = any(${named('lists')}::uuid[]) or id = any(${named('list_email_aliases')}::uuid[]))
         or substring(lower(recipient) from '\\+task-([0-9a-f-]{36})@') = any(${named('tasks')}::text[])`)
    await filedBy('mail out about them', 'outbound_email_messages', () => sql`
      select id::text as id from outbound_email_messages where task_id = any(${named('tasks')}::uuid[]) or list_id = any(${named('lists')}::uuid[])`)
  }
  /*
   * And the mail in from the run's own accounts, and out to them, filed or
   * not: a reply refused as answering nothing of ours names no task and no
   * list (`email-reply-routing` left one a run). Only an account made since the
   * run began is the run's, as below.
   */
  if (j.accountIds.length || j.emails.length) {
    const theirs = () => sql`
      select lower(email) from users
      where (id = any(${j.accountIds}::uuid[]) or lower(email) = any(${j.emails}::text[]))
        and created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'`
    await filedBy('mail in from their accounts', 'inbound_email_messages', () => sql`
      select id::text as id from inbound_email_messages where lower(from_address) in (${theirs()})`)
    await filedBy('mail out to their accounts', 'outbound_email_messages', () => sql`
      select id::text as id from outbound_email_messages where lower(recipient) in (${theirs()})`)
  }
  if (j.rows.has('tasks')) {
    await filedBy('tags their tasks made', 'labels', () => sql`
      select distinct l.id::text as id from labels l join task_label_assignments a on a.label_id = l.id
      where a.task_id = any(${[...j.rows.get('tasks')]}::uuid[]) and l.created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'`)
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
  // A registered organization older than the run is not the run's either: the admin's holds Main.
  const registeredOrgs = [...(j.rows.get('organizations') ?? [])]
  const youngOrgs = registeredOrgs.length
    ? ((await step('read the organizations registered', () => sql`
        select id::text as id from organizations
        where id = any(${registeredOrgs}::uuid[]) and created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'`)) ?? []).map((o) => o.id)
    : []
  const orgIds = [...new Set([...owned, ...youngOrgs])]
  const kept = []
  if (registeredOrgs.length > youngOrgs.length) kept.push(said('organizations', registeredOrgs.length - youngOrgs.length))
  // What the store holds for the workspaces and accounts that go, read while their rows say so.
  const holding = await step('read what the store holds for them', () =>
    storedOf(sql, [...(j.rows.get('workspaces') ?? [])], orgIds, accountIds, [...(j.rows.get('tasks') ?? [])]))

  // 1. What was registered by table: other tables first, then spaces, then workspaces.
  // A ROW OLDER THAN THE RUN IS NOT THE RUN'S, as an account is not: a route
  // that answers with a row it already had (the task an assignee was added to)
  // registers that row, and it stays. Kept rows are said, and not read back.
  const order = [...tables.filter((t) => t !== 'spaces' && t !== 'workspaces'), ...tables.filter((t) => t === 'spaces'), ...tables.filter((t) => t === 'workspaces')]
  const ours = new Map()
  for (const table of order) {
    const ids = [...j.rows.get(table)]
    const young = await step(`read the ${table} by age`, async () => {
      if (!(await sql`select to_regclass(${`public.${table}`}) is not null as ok`)[0].ok) throw new Error(`there is no table ${table}`)
      const dated = (await sql`select 1 from information_schema.columns where table_schema = 'public' and table_name = ${table} and column_name = 'created_at'`).length > 0
      if (!dated) return ids
      const elder = (await sql`
        select id::text as id from ${sql(table)}
        where id = any(${ids}::uuid[]) and created_at < to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'`).map((r) => r.id)
      if (elder.length) kept.push(said(table, elder.length))
      return ids.filter((id) => !elder.includes(id))
    })
    ours.set(table, young ?? ids)
    if (!young?.length) continue
    const n = await step(`remove ${said(table, young.length)}`, async () => {
      await clearRestricting(sql, table, young)
      return (await sql`delete from ${sql(table)} where id = any(${young}::uuid[])`).count
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
  // The notifications about what went: a notification names what it is about
  // only in `target` (its `entityId`, and the ids along its `url`), which no key
  // holds, so it outlived the task, channel or list it pointed at.
  const gone = [...new Set([...ours.values()].flat())]
  if (gone.length) {
    const about = await step('remove the notifications about them', async () => (await sql`
      with gone as (select unnest(${gone}::text[]) as id)
      delete from notifications n
      where n.created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'
        and (n.target->>'entityId' in (select id from gone)
             or exists (select 1 from regexp_matches(coalesce(n.target->>'url', ''), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g') m
                        where m[1] in (select id from gone)))`).count)
    if (about) removed.push(plural(about, 'notification'))
    // And what the AI's index holds of them: an embedding names its source by id alone, and has no time of its own to be read by.
    const indexed = await step('remove what the AI index holds of them', async () =>
      (await sql`delete from knowledge_embeddings where source_id::text in (select unnest(${gone}::text[]))`).count)
    if (indexed) removed.push(plural(indexed, 'indexed passage'))
    // What was opened of them from a search: it names them by id, under no key that takes it.
    const opened = await step('remove what was opened of them from a search', async () =>
      (await sql`delete from search_engagement where entity_id in (select unnest(${gone}::text[]))`).count)
    if (opened) removed.push(plural(opened, 'search open'))
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
  // 4. What the store held for them, now that no row names it.
  const purged = holding ? await step('remove what the store held for them', () => purgeStored(holding, storeOf())) : null
  if (purged?.removed) removed.push(plural(purged.removed, 'stored object'))
  if (purged?.unsaid) removed.push(`and left the store as it was: ${purged.unsaid}`)

  // What is still there, read back.
  const left = []
  if (purged?.left) left.push(plural(purged.left, 'stored object'))
  const still = await step('read back the accounts', () => sql`
    select email from users
    where (id = any(${[...new Set([...j.accountIds, ...accountIds])]}::uuid[]) or lower(email) = any(${j.emails}::text[]))
      and created_at >= to_timestamp(${j.run.started} / 1000.0) - interval '1 minute'`)
  if (still?.length) left.push(`${said('users', still.length)} (${still.map((r) => r.email).join(', ')})`)
  if (elder.length) removed.push(`and kept ${said('users', elder.length)} older than the run, registered though it did not make them (${elder.join(', ')})`)
  if (kept.length) removed.push(`and kept ${kept.join(', ')} older than the run, registered though it did not make them`)
  if (orgIds.length) {
    const o = await step('read back the organizations', () => sql`select count(*)::int as n from organizations where id = any(${orgIds}::uuid[])`)
    if (o?.[0]?.n) left.push(said('organizations', o[0].n))
  }
  for (const table of order) {
    const ids = ours.get(table)
    if (!ids.length) continue
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

/*
 * WHAT A RUN LEFT THAT NOTHING REGISTERED (`found-30-sep/suite-leftovers-unmeasured`).
 * Removal reaches what a journal names, and suites made more than they named:
 * after the lanes were brought to pristine's hierarchy, a sweep of the 268
 * suites left 559 rows in 43 tables, from 53 suites — `person-panel` 138 (its
 * tasks, deleted through the product, which only bins them), `task-depth` 73,
 * `task-merge` 48. So at the end of a run, once its journal is swept: every
 * row made on this database since the run began, in any table with a
 * `created_at`, but these, which using the product as somebody makes and
 * which hold nothing a later run reads as its own:
 */
export const LEFT_BY_USE = {
  sessions: 'a sign-in',
  rate_limit_counters: 'a request counted toward a limit',
  ai_usage: 'an AI call counted toward the hourly AI limit, which reads only the last hour',
  audit_logs: "the audit trail (a workspace's own goes with it)",
  flag_audit_log: "the feature flags' audit trail",
  search_engagement: 'what somebody opened from a search (one about a row the run removes goes with it)',
  personal_tasks: "Home's old to-dos, which nothing writes now: a person's first Personal List takes theirs in as its tasks, and removes them here",
  // Not a run's: the API's own 2 AM schedule scores every project, and blamed the run going then (`found-14-oct/leftover-audit-blames-the-nightly-scores`).
  project_health_scores: "a project's daily health score, which the API's own schedule writes for every project at 2 AM (one about a project the run removes goes with it)",
}
/*
 * And a notification the API's own schedules write (task reminders every
 * minute, the hourly briefing, the daily workload alert), about what is due,
 * not about what a run did: one with no actor, of a kind only they write
 * (`SCHEDULED`). A run's notifications have an actor, its people or the admin
 * it signs in as, but for what a request writes for nobody: a test
 * notification (`panel-collapse` left one in the admin's inbox every run), an
 * automation's. Those are counted. And a built-in project template,
 * which every API writes as it starts when its database lacks one: a suite
 * that starts an API of its own (`private-object-urls`) starts that too.
 *
 * Every other row fails the run: register it (`madeRow`, lib/made.mjs) and it
 * goes at the end. Read on the assumption the lanes and CI keep, that one run
 * at a time writes to a database: a script run beside this one makes rows this
 * cannot tell from the run's.
 */
/** The kinds of notification the API's schedules write, with no actor (`reminders`, `task-reminders`, `briefing`, `workload-alert`). */
export const SCHEDULED = ['task_due_soon', 'task_overdue', 'task_updated', 'message_reminder', 'ai_briefing', 'workload_alert']

/*
 * Each table's own time of making: `created_at`, or, where it has none, the
 * time its row says it came (`received_at`, `joined_at`, `added_at`…), the
 * first column that is a time set as the row is written. A table with only
 * `updated_at` cannot say a row is new. Read by the leftovers and by the rows
 * a run finds alike, and said once: a copy of it in each was a rule the gate's
 * mutation could break in one place and not the other (the rehearsal of
 * `a936b69`: "ANCHOR AMBIGUOUS made-at-only-created").
 */
const madeAtColumns = (sql) => sql`
    select distinct on (c.table_name) c.table_name as t, c.column_name as at
    from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.data_type like 'timestamp%'
      and (c.column_name = 'created_at' or (c.column_default like 'now()%' and c.column_name <> 'updated_at' and c.column_name not like 'last\\_%'))
    order by c.table_name, (c.column_name = 'created_at') desc, c.ordinal_position`

/*
 * ROWS THE PRODUCT MAKES THE FIRST TIME IT IS USED, which are nobody's run's
 * (`found-7-oct/first-use-rows-counted-as-left`): a workspace's #general, made
 * by the first member to list its channels (`ChatService.ensureGeneralChannel`),
 * with that member in it; and a person's dock, made by the first page they open,
 * which it keeps among their recent pages (`DashboardsService.updateDockConfig`).
 * On a lane both were made long ago; in CI's fresh database the first suite to
 * open chat or the app makes them, and `syncup-live` was failed for it in the
 * rehearsal of `a936b69`. Another channel still counts, and so does the dock of
 * an account the run made.
 */
const GENERAL = sql => sql`c.name = 'general' and not c.is_dm and not c.is_private`
/*
 * And a person's Personal List (`found-24-sep/planner-default-list-read-by-nothing`),
 * made the first time they need one — Home's Personal List opened, a task made
 * with no list chosen, the Move picker read — with its statuses, and the
 * workspace's personal space and its container, made by the first person's
 * (`ensurePersonalList`). An account the run made takes its own list with it;
 * a shared account's is nobody's run's, as its dock is not. What is put in it
 * counts, as anything put anywhere does.
 */
const SHARED_PERSONAL_LIST = (sql, since) => sql`l.personal_of is not null and exists (select 1 from users u where u.id = l.personal_of and u.created_at < ${since})`

export async function leftSince(sql, started) {
  const madeAt = (await madeAtColumns(sql)).filter((r) => !(r.t in LEFT_BY_USE))
  const since = sql`to_timestamp(${started} / 1000.0)`
  const left = []
  for (const { t, at } of madeAt) {
    const [{ n }] = t === 'chat_channels'
      ? await sql`select count(*)::int as n from chat_channels c where c.created_at >= ${since} and not (${GENERAL(sql)})`
      : t === 'chat_channel_members'
      ? await sql`select count(*)::int as n from chat_channel_members m where m.${sql(at)} >= ${since}
                    and not exists (select 1 from chat_channels c where c.id = m.channel_id and ${GENERAL(sql)})`
      : t === 'user_dock_configs'
      ? await sql`select count(*)::int as n from user_dock_configs d where d.${sql(at)} >= ${since}
                    and exists (select 1 from users u where u.id = d.user_id and u.created_at >= ${since})`
      : t === 'spaces'
      ? await sql`select count(*)::int as n from spaces s where s.${sql(at)} >= ${since} and not s.is_personal`
      : t === 'projects'
      ? await sql`select count(*)::int as n from projects p where p.${sql(at)} >= ${since}
                    and not exists (select 1 from spaces s where s.id = p.space_id and s.is_personal)`
      : t === 'lists'
      ? await sql`select count(*)::int as n from lists l where l.${sql(at)} >= ${since} and not (${SHARED_PERSONAL_LIST(sql, since)})`
      : t === 'list_statuses'
      ? await sql`select count(*)::int as n from list_statuses x where x.${sql(at)} >= ${since}
                    and not exists (select 1 from lists l where l.id = x.list_id and ${SHARED_PERSONAL_LIST(sql, since)})`
      : t === 'notifications'
      ? await sql`select count(*)::int as n from notifications where created_at >= to_timestamp(${started} / 1000.0) and (actor_id is not null or not (type::text = any(${SCHEDULED}::text[])))`
      : t === 'project_templates'
        ? await sql`select count(*)::int as n from project_templates where created_at >= to_timestamp(${started} / 1000.0) and not is_built_in`
        : await sql`select count(*)::int as n from ${sql(t)} where ${sql(at)} >= to_timestamp(${started} / 1000.0)`
    if (n) left.push({ table: t, n })
  }
  return left
}

/*
 * AND WHAT A RUN LEFT CHANGED OF WHAT IT FOUND (`found-7-oct/shared-rows-keep-what-runs-changed`).
 * The rows every run shares — the admins' accounts and docks, Main, its space,
 * list and tasks, the task types, the platform's switches — are no run's to
 * remove, and a run that changes one and does not put it back hands the next a
 * database unlike the one it was written for: lane 7's admin kept a planner
 * rail without "Meet with" from an earlier run, and `calendar-accounts`, which
 * looks for that box, failed there and nowhere else. So as a run begins
 * (`--found`, which `lib/made.mjs` runs as the journal opens), every row of
 * every table with an id is read, but those using the product makes
 * (`LEFT_BY_USE`); and as it ends, each is read again. One changed outside what
 * using the product writes (`CHANGED_BY_USE`), or gone, fails the run, named
 * with its columns. A row made within the minute before the run began is the
 * run's, as the sweep takes it, and is not read so.
 */
export const CHANGED_BY_USE = {
  '*': ['updated_at'],
  users: ['last_seen_at'],
  // The pages a person last visited, written as they go.
  user_dock_configs: ['nav_recents'],
}
const foundFile = (journal) => `${journal}.found.json`
const FOUND_NAME = /^(.+)\.(\d+)\.(\d+)\.jsonl\.found\.json$/

/** Every row a run finds, by table and id, and each table's own time of making where it has one. */
export async function rowsFound(sql) {
  const tables = (await sql`
    select c.table_name as t from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'id'
    order by 1`).map((r) => r.t).filter((t) => !(t in LEFT_BY_USE))
  const madeAt = Object.fromEntries((await madeAtColumns(sql)).map((r) => [r.t, r.at]))
  const rows = {}
  for (const t of tables) {
    const got = await sql`select id::text as id, to_jsonb(x) as row from ${sql(t)} x`
    if (got.length) rows[t] = Object.fromEntries(got.map((r) => [r.id, r.row]))
  }
  return { rows, madeAt }
}

/** What of the rows found is changed now, or gone: `[{ table, id, label, cols }]`, `cols` null for a row gone. */
export function changedSince(found, now, started) {
  const out = []
  for (const [table, rows] of Object.entries(found.rows)) {
    const byUse = new Set([...CHANGED_BY_USE['*'], ...(CHANGED_BY_USE[table] ?? [])])
    // A table with no time of making says when its row was last written instead (the AI index's passages).
    const at = found.madeAt[table] ?? ('updated_at' in (Object.values(rows)[0] ?? {}) ? 'updated_at' : null)
    for (const [id, was] of Object.entries(rows)) {
      if (at && Date.parse(was[at]) >= started - 60_000) continue
      const label = was.email || was.name || was.title || was.flag_key || id
      const is = now.rows[table]?.[id]
      if (!is) {
        out.push({ table, id, label, cols: null })
        continue
      }
      const cols = Object.keys(was).filter((k) => !byUse.has(k) && JSON.stringify(was[k]) !== JSON.stringify(is[k]))
      if (cols.length) out.push({ table, id, label, cols })
    }
  }
  return out
}

/**
 * The shared rows a run said it changes (`changesShared`), written back as the
 * run found them: those columns only, from what it found. Said, by row.
 */
export async function putBack(sql, found, said) {
  const back = []
  for (const s of said) {
    const rows = found.rows[s.t] ?? {}
    const same = (row) => Object.entries(s.match ?? {}).every(([c, v]) => (c === 'email' ? String(row[c] ?? '').toLowerCase() === String(v).toLowerCase() : String(row[c] ?? '') === String(v)))
    const id = s.id ?? Object.keys(rows).find((k) => same(rows[k]))
    const was = id ? rows[id] : null
    if (!was) continue
    const cols = s.cols.filter((c) => c in was)
    if (!cols.length) continue
    await sql`
      update ${sql(s.t)} set (${sql(cols)}) = (select ${sql(cols)} from jsonb_populate_record(null::${sql(s.t)}, ${was}::jsonb))
      where id = ${id}::uuid`
    back.push(`${s.t} ${was.email || was.name || was.title || id} (${cols.join(', ')})`)
  }
  return back
}

/** What a run finds as it begins, written beside its journal for its end to read. */
async function writeFound(journal) {
  let sql = null
  try {
    sql = await openDb()
    if (!sql) return 0
    fs.writeFileSync(foundFile(journal), JSON.stringify(await rowsFound(sql)))
    return 0
  } catch (e) {
    console.log(`  (what this run found could not be read: ${String(e?.message ?? e).split('\n')[0]}; what it changes of it is not read at its end)`)
    return 1
  } finally {
    await sql?.end({ timeout: 5 }).catch(() => {})
  }
}

async function main(argv) {
  if (argv[0] === '--holds') return holds(argv[1], argv[2])
  if (argv[0] === '--found') return writeFound(argv[1])
  // A run's own end reads what it left; a journal swept by hand has no run around it to read.
  const atExit = argv[0] === '--exit'
  if (atExit) argv = argv.slice(1)
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
      const f = FOUND_NAME.exec(name)
      if (f) {
        if (!stillRunning(Number(f[2]), `${f[1]}.mjs`) && !names.includes(name.replace(/\.found\.json$/, ''))) fs.rmSync(path.join(dir, name), { force: true })
        continue
      }
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
    runs.push({ dir: path.dirname(file), started: j.run.started, journal: kept, shared: j.shared })
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
    if (ended) fs.rmSync(foundFile(kept), { force: true })
    if (j.bad.length) console.log(`    (and passed over ${j.bad.length} unreadable line(s) of its journal: ${j.bad[0]}…)`)
    fs.rmSync(file, { force: true })
  }
  if (!ended && sql) {
    for (const { dir, started, journal, shared } of runs) {
      const nobody = await unregisteredSince(sql, dir, started).catch(() => [])
      if (nobody.length) {
        console.log(`  ! ${plural(nobody.length, 'account was', 'accounts were')} made on this database while this run ran that no run registered, and stay: ${nobody.join(', ')}` +
          ' — if this run made them (through a page, say), register them with madeAccount({ email }) before they are made (lib/made.mjs)')
      }
      if (!atExit) continue
      let left
      try {
        left = await leftSince(sql, started)
      } catch (e) {
        status = 1
        console.log(`  ✗ could not read what this run left: ${String(e?.message ?? e).split('\n')[0]}`)
        continue
      }
      if (left.length) {
        status = 1
        console.log(`  ✗ this run left ${plural(left.reduce((n, l) => n + l.n, 0), 'row')} that nothing it registered removes: ${left.map((l) => `${said(l.table, l.n)}`).join(', ')}` +
          ' — register what it makes (madeRow, lib/made.mjs), as it is made')
      }
      const file = foundFile(journal)
      if (!fs.existsSync(file)) continue
      let changed
      try {
        const found = JSON.parse(fs.readFileSync(file, 'utf8'))
        const back = shared.length ? await putBack(sql, found, shared) : []
        if (back.length) console.log(`  (put back as this run found them: ${back.join('; ')})`)
        changed = changedSince(found, await rowsFound(sql), started)
      } catch (e) {
        status = 1
        console.log(`  ✗ could not read what this run left changed of what it found: ${String(e?.message ?? e).split('\n')[0]}`)
        continue
      } finally {
        fs.rmSync(file, { force: true })
      }
      if (changed.length) {
        status = 1
        const named = changed.slice(0, 12).map((c) => `${c.table} ${c.label} (${c.cols ? c.cols.join(', ') : 'gone'})`)
        console.log(`  ✗ this run left ${plural(changed.length, 'row')} it found changed: ${named.join('; ')}${changed.length > 12 ? '; …' : ''}` +
          ' — put back what it changes of what every run shares, as it ends, or change rows of its own')
      }
    }
  }
  await sql?.end({ timeout: 5 }).catch(() => {})
  return status
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
