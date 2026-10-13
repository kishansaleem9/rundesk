#!/usr/bin/env node
/*
 * THE CALENDAR SEAM, AND THAT THE DOUBLE ON THE END OF IT IS HONEST
 * (`found-25-sep/connected-calendars-read-by-nothing`).
 *
 * `scripts/e2e-lanes/calendar-stub.mjs` answers what the product asks Google
 * Calendar and Microsoft Graph on the lanes, so a suite can see a connected
 * calendar's events drawn and a block written. A stub that answered in shapes
 * the providers do not — a time where Google says a date, a next page Graph
 * would never give, a refusal it would never make — would let those suites
 * pass about a product that fails against the real thing. So the product's OWN
 * readers and writers (`calendar-events.ts`) are driven against it here, and
 * each rule of the stub is broken in turn: a case must notice.
 *
 *   node scripts/check-calendar-stub.mjs            # the cases
 *   node scripts/check-calendar-stub.mjs --mutate   # and that each one bites
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { namedFailures } from './lib/mutate.mjs'
import { freePort } from './lib/free-port.mjs'
import { runMutant } from './lib/run-mutant.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const STUB = process.env.CALENDAR_STUB ?? join(HERE, 'e2e-lanes/calendar-stub.mjs')
// Asked of the OS: a pid-chosen port could be a lane stub's (`scripts/lib/free-port.mjs`).
const PORT = await freePort()

let pass = 0
let fail = 0
const failures = []
const chk = (cond, good, bad) => {
  if (cond) {
    pass += 1
    console.log(`  \x1b[32mPASS\x1b[0m ${good}`)
  } else {
    fail += 1
    failures.push(bad ?? good)
    console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`)
  }
}

/*
 * The probe calls the product's own functions, as the API calls them, against
 * the stub; what it prints is all the cases read. Each step is caught on its
 * own, so one broken rule costs one answer, not the run.
 */
const PROBE = `
import { readGoogle, readGraph, writeEvent, deleteEvent, CalendarRefused } from './src/modules/calendar-sync/calendar-events'
import { draftInMailbox } from './src/modules/email-accounts/mailbox.client'
const BASE = 'http://127.0.0.1:${PORT}'
process.env.GOOGLE_CALENDAR_API_URL = BASE + '/google/calendar/v3'
process.env.MS_GRAPH_API_URL = BASE + '/graph/v1.0'
process.env.GMAIL_API_URL = BASE + '/gmail/v1'
const control = (path: string, body: unknown) =>
  fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
const held = (token: string) => fetch(BASE + '/__control/calendar?token=' + token).then((r) => r.json())
const from = new Date('2026-10-08T00:00:00Z')
const to = new Date('2026-10-09T00:00:00Z')
async function step<T>(out: Record<string, unknown>, key: string, run: () => Promise<T>) {
  try { out[key] = await run() } catch (err) { out[key] = { threw: String((err as Error)?.constructor?.name) + ': ' + String((err as Error)?.message ?? err) } }
}
async function main() {
  const out: Record<string, unknown> = {}
  await control('/__control/calendar', { token: 'g', provider: 'gcal', events: [
    { id: 'in', title: 'Standup', start: '2026-10-08T09:00:00Z', end: '2026-10-08T09:15:00Z' },
    { id: 'day', title: 'Holiday', start: '2026-10-08', end: '2026-10-09', allDay: true },
    { id: 'out', title: 'Next week', start: '2026-10-15T09:00:00Z', end: '2026-10-15T10:00:00Z' },
  ], refreshToken: 'g-refresh' })
  await step(out, 'google', async () => (await readGoogle('g', 'primary', 'acc', from, to)).events.map((e) => [e.id, e.start, e.end, e.allDay]))
  await step(out, 'refused', async () => {
    try { await readGoogle('nobody', 'primary', 'acc', from, to); return 'read' } catch (err) { return err instanceof CalendarRefused ? 'refused' : 'other' }
  })
  await control('/__control/calendar', { token: 'o', provider: 'outlook', events: [
    { id: 'o1', title: 'Review', start: '2026-10-08T15:00:00Z', end: '2026-10-08T16:00:00Z' },
    { id: 'o2', title: 'Away', start: '2026-10-08', end: '2026-10-09', allDay: true },
  ] })
  await step(out, 'graph', async () => (await readGraph('o', 'acc', from, to)).events.map((e) => [e.id, e.start, e.end, e.allDay]))
  await step(out, 'written', async () => {
    const block = { title: 'Focus', start: new Date('2026-10-08T13:00:00Z'), end: new Date('2026-10-08T14:00:00Z'), allDay: false }
    const id = await writeEvent('gcal', 'g', 'primary', block, null)
    const made = (await held('g')).events.find((e: any) => e.id === id)
    await writeEvent('gcal', 'g', 'primary', { ...block, start: new Date('2026-10-08T14:00:00Z'), end: new Date('2026-10-08T15:00:00Z') }, id)
    const moved = (await held('g')).events.find((e: any) => e.id === id)
    await deleteEvent('gcal', 'g', 'primary', id)
    const kept = (await held('g')).events.some((e: any) => e.id === id)
    let again = 'done'
    try { await deleteEvent('gcal', 'g', 'primary', id) } catch { again = 'threw' }
    const graphId = await writeEvent('outlook', 'o', 'primary', block, null)
    const graphMade = (await held('o')).events.find((e: any) => e.id === graphId)
    return { made: made && [made.start, made.end, made.title], moved: moved && [moved.start, moved.end], kept, again, graph: graphMade && [Date.parse(graphMade.start), Date.parse(graphMade.end)] }
  })
  // An invite (\`ledger-rows/row-2294\`): Google is asked to send it, and the write is kept as it was asked.
  await step(out, 'invite', async () => {
    const e = { title: 'Review', start: new Date('2026-10-08T11:00:00Z'), end: new Date('2026-10-08T11:30:00Z'), allDay: false, location: 'Room 4', attendees: ['ann@x.test'] }
    const id = await writeEvent('gcal', 'g', 'primary', e, null)
    const w = (await held('g')).writes.filter((x: any) => x.method === 'POST').pop()
    return { id: typeof id === 'string', sendUpdates: w?.query?.sendUpdates ?? null, attendees: w?.body?.attendees ?? null, location: w?.body?.location ?? null }
  })
  // And a Gmail draft, left in Drafts and not sent.
  await control('/__control/mailbox', { token: 'mb', provider: 'gmail', address: 'me@x.test' })
  await step(out, 'draft', async () => {
    const d = await draftInMailbox({ provider: 'gmail', accessToken: 'mb' }, { fromName: 'Me', fromAddress: 'me@x.test', to: ['ann@x.test'], cc: [], bcc: [], subject: 'Notes', text: 'The notes.', attachments: [] })
    const box = await fetch(BASE + '/__control/mailbox?token=mb').then((r) => r.json())
    const m = box.messages[0]
    return { id: typeof d.id === 'string' && d.id.length > 0, count: box.messages.length, isDraft: m?.isDraft ?? null, to: m?.to ?? null, subject: m?.subject ?? null, text: m?.text ?? null }
  })
  const many = Array.from({ length: 300 }, (_, i) => ({ id: 'm' + i, title: 'M' + i, start: '2026-10-08T10:00:00Z', end: '2026-10-08T10:30:00Z' }))
  await control('/__control/calendar', { token: 'gm', provider: 'gcal', events: many })
  await control('/__control/calendar', { token: 'om', provider: 'outlook', events: many })
  await step(out, 'pages', async () => {
    const g = await readGoogle('gm', 'primary', 'acc', from, to)
    const o = await readGraph('om', 'acc', from, to)
    return { google: [g.events.length, g.truncated], graph: [o.events.length, o.truncated] }
  })
  await step(out, 'refresh', async () => {
    const ask = (refresh: string) => fetch(BASE + '/google/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }).toString(),
    })
    const good = await ask('g-refresh')
    const token = (await good.json()).access_token
    const read = token ? (await readGoogle(token, 'primary', 'acc', from, to)).events.length : -1
    const bad = await ask('never-issued')
    return { good: good.status, read, bad: bad.status }
  })
  await step(out, 'controls', async () => {
    await control('/__control/fail', { token: 'g', status: 503, count: 2 })
    const answers: string[] = []
    for (let i = 0; i < 3; i++) {
      try { await readGoogle('g', 'primary', 'acc', from, to); answers.push('read') } catch (err) { answers.push(err instanceof CalendarRefused ? 'refused' : 'failed') }
    }
    await control('/__control/reset', { token: 'g' })
    let after = 'read'
    try { await readGoogle('g', 'primary', 'acc', from, to) } catch (err) { after = err instanceof CalendarRefused ? 'refused' : 'failed' }
    return { answers, after }
  })
  console.log('RESULT ' + JSON.stringify(out))
}
void main()
`

const startStub = () => {
  const child = spawn(process.execPath, [STUB, '--port', String(PORT)], {
    env: { ...process.env, RUNDESK_CALENDAR_STUB: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new Promise((resolve, reject) => {
    let seen = ''
    const bail = setTimeout(() => reject(new Error(`the stub never announced itself: ${seen}`)), 60_000)
    child.stdout.on('data', (d) => {
      seen += d
      if (/"ready":true/.test(seen)) {
        clearTimeout(bail)
        resolve(child)
      }
    })
    child.stderr.on('data', (d) => (seen += d))
    child.on('exit', (code) => {
      clearTimeout(bail)
      reject(new Error(`the stub exited with ${code}: ${seen}`))
    })
  })
}

// Named after the process that writes it; a mutant's is removed by the gate that ran it.
const probeFileOf = (pid) => join(ROOT, 'apps/api', `.calendar-stub-probe-${pid}.ts`)
const probe = () => {
  const file = probeFileOf(process.pid)
  try {
    writeFileSync(file, PROBE)
    const r = spawnSync('pnpm', ['exec', 'tsx', file], { cwd: join(ROOT, 'apps/api'), encoding: 'utf8', timeout: 120_000 })
    const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('RESULT '))
    if (!line) return { none: `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().slice(-400) }
    return JSON.parse(line.slice(7))
  } finally {
    rmSync(file, { force: true })
  }
}

const stub = await startStub()
let out
try {
  console.log('\n▶ the product’s calendar readers and writers, against the stub')
  out = probe()
} finally {
  stub.kill('SIGTERM')
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
if (out.none !== undefined) {
  console.error(`\n[calendar-stub] the probe printed no result:\n${out.none}`)
  process.exitCode = 1
} else {
  chk(
    same(out.google, [['day', '2026-10-08', '2026-10-09', true], ['in', '2026-10-08T09:00:00.000Z', '2026-10-08T09:15:00.000Z', false]]),
    'Google lists the events that overlap the window by when they start — an all-day one by its dates, from its midnight, then a timed one by its instants — and not one outside it',
    `read ${JSON.stringify(out.google)}`,
  )
  chk(out.refused === 'refused', 'and a token nobody seeded is refused, 401, as a revoked grant is', `the read answered ${JSON.stringify(out.refused)}`)
  chk(
    same(out.graph, [['o2', '2026-10-08', '2026-10-09', true], ['o1', '2026-10-08T15:00:00.000Z', '2026-10-08T16:00:00.000Z', false]]),
    'Graph’s calendarView lists them in UTC, as the product asks, an all-day one by its midnights',
    `read ${JSON.stringify(out.graph)}`,
  )
  const w = out.written ?? {}
  chk(
    same(w.made, ['2026-10-08T13:00:00.000Z', '2026-10-08T14:00:00.000Z', 'Focus'])
      && same(w.moved, ['2026-10-08T14:00:00.000Z', '2026-10-08T15:00:00.000Z'])
      && w.kept === false && w.again === 'done'
      && same(w.graph, [Date.parse('2026-10-08T13:00:00Z'), Date.parse('2026-10-08T14:00:00Z')]),
    'an event written is held at its time, a change moves it, a delete removes it, and a second delete is done; Graph holds one written in UTC too',
    `wrote ${JSON.stringify(w)}`,
  )
  chk(
    same(out.invite, { id: true, sendUpdates: 'all', attendees: [{ email: 'ann@x.test' }], location: 'Room 4' }),
    'an event that invites people is written with them, its place, and Google asked to send the invitations — kept with the query it came with',
    `wrote ${JSON.stringify(out.invite)}`,
  )
  chk(
    same(out.draft, { id: true, count: 1, isDraft: true, to: ['ann@x.test'], subject: 'Notes', text: 'The notes.' }),
    'a Gmail draft is kept in the mailbox as a draft — its recipients, subject and words — and nothing is sent',
    `kept ${JSON.stringify(out.draft)}`,
  )
  chk(
    same(out.pages, { google: [300, false], graph: [300, false] }),
    'three hundred events come in pages, Google’s by page token and Graph’s by its own next link, and every one is read',
    `read ${JSON.stringify(out.pages)}`,
  )
  chk(
    out.refresh?.good === 200 && out.refresh?.read === 2 && out.refresh?.bad === 400,
    'a refresh token seeded with a calendar answers a new token that reads it, and one never issued is refused invalid_grant',
    `refreshed ${JSON.stringify(out.refresh)}`,
  )
  chk(
    same(out.controls, { answers: ['failed', 'failed', 'read'], after: 'refused' }),
    'a staged failure answers as many calls as it was asked to, and a reset forgets the calendar',
    `answered ${JSON.stringify(out.controls)}`,
  )
}

if (process.argv.includes('--mutate')) {
  // Each mutant runs this whole file again, a probe included.
  const MUTANT_TIMEOUT_MS = Number(process.env.STUB_GATE_MUTANT_TIMEOUT_MS) || 300_000
  const ORIGINAL = readFileSync(STUB, 'utf8')
  let blind = 0
  const MUTATIONS = [
    ['the window is not read', 'const inWindow = (e, from, to) => {\n  const s = spanOf(e)\n  return s.from < to && s.to > from', 'const inWindow = (e, from, to) => {\n  const s = spanOf(e)\n  return s.from === s.from'],
    ['any token opens the first calendar', 'const cal = calendars.get(token)\n', 'const cal = calendars.get(token) ?? [...calendars.values()][0]\n'],
    ['Google is told an all-day event as a time', 'start: e.allDay ? { date: e.start } : { dateTime: e.start },', 'start: { dateTime: e.start },'],
    ['Graph says its times an hour off', "const graphTime = (iso) => new Date(iso).toISOString()", 'const graphTime = (iso) => new Date(Date.parse(iso) + 3_600_000).toISOString()'],
    ['Google never says there is another page', "...(at + size < all.length ? { nextPageToken: String(at + size) } : {}),", ''],
    ['Graph’s next page is on another host', "const next = new URL(url)\n", "const next = new URL(url)\n    next.host = 'elsewhere.test'\n"],
    ['a change is answered and not kept', 'cal.events.set(had.id, merged)\n      record(body)\n      return json(res, 200, googleEvent(merged))', 'record(body)\n      return json(res, 200, googleEvent(merged))'],
    ['a delete is answered and not done', '      cal.events.delete(eventId)\n      record(null)\n      return empty(res, 204)\n    }\n    return json(res, 405', '      record(null)\n      return empty(res, 204)\n    }\n    return json(res, 405'],
    ['any refresh token is taken', "if (form.get('grant_type') !== 'refresh_token' || !cal || cal.provider !== provider) {", "if (form.get('grant_type') !== 'refresh_token' || !cal && false) {"],
    ['a staged failure never runs out', 'cal.fail.left -= 1\n', ''],
    ['a write forgets the query it came with', 'query: Object.fromEntries(url.searchParams), ', ''],
    ['a Gmail draft is kept as sent', "direction: 'sent', isDraft: true, at: Date.now() })\n      return json(res, 200, { id: draftId", "direction: 'sent', isDraft: false, at: Date.now() })\n      return json(res, 200, { id: draftId"],
  ]
  console.log('\n▶ and each mutation of the stub reddens a case')
  for (const [label, from, to] of MUTATIONS) {
    if (ORIGINAL.split(from).length - 1 !== 1) {
      console.log(`  \x1b[31mANCHOR MISS\x1b[0m ${label}`)
      blind += 1
      continue
    }
    // Beside the original, never over it.
    const mutant = join(dirname(STUB), `.calendar-stub-mutant-${label.replace(/\W+/g, '-')}.mjs`)
    try {
      writeFileSync(mutant, ORIGINAL.split(from).join(to))
      const r = runMutant([fileURLToPath(import.meta.url)], {
        timeout: MUTANT_TIMEOUT_MS,
        env: { ...process.env, CALENDAR_STUB: mutant },
        leftBehind: (pid) => [probeFileOf(pid)],
      })
      if (/the probe printed no result/.test(r.stderr ?? '')) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — the mutant never got a result back`)
        blind += 1
        continue
      }
      if (r.error?.code === 'ETIMEDOUT' || r.signal) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — its run was ended after ${MUTANT_TIMEOUT_MS / 1000} s (${r.signal ?? r.error.code}): a loaded machine, not the rule; run it again`)
        blind += 1
        continue
      }
      const named = namedFailures(r.stdout)
      if (r.status === 0) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — every case still passes`)
        blind += 1
      } else if (named === 0) {
        const said = String(r.stderr ?? '').trim().split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 240)
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — it exited non-zero but named no case${said ? ` (it said: ${said})` : ''}`)
        blind += 1
      } else {
        console.log(`  \x1b[32mreddens\x1b[0m ${label} (${named} case(s))`)
      }
    } finally {
      rmSync(mutant, { force: true })
    }
  }
  console.log(`\n${blind === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} mutations: ${MUTATIONS.length - blind} of ${MUTATIONS.length} bite`)
  if (blind) fail += blind
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.error(`\n[calendar-stub] ${fail} case(s) did not hold:`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exitCode = 1
}
