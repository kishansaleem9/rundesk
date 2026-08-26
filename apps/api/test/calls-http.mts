/**
 * §2.8 SyncUp — the real call routes, against real Postgres.
 *
 * The calls service has had a thorough unit suite from the beginning, and it
 * has been wrong three times in ways the unit suite could not see, because the
 * database in it was a hand-written fake: it modelled a drizzle builder as a
 * bare thenable, it recorded inserts only when `.returning()` was called, and
 * it dispatched selects by guessing from the projection's shape. Each of those
 * was a defect in the CHECK rather than the code, and each one hid whatever the
 * code was really doing.
 *
 * More to the point, the one class of bug this feature has actually shipped —
 * a drizzle query that renders differently than it reads — is invisible to any
 * fake by construction. `listMessages` hydrating a call onto a card, and
 * `transcriptFor` joining lines to their speakers, have never once run against
 * Postgres.
 *
 * Same shape as skills-http.mts, and the same reasoning: real guards, real
 * controller, real DTOs and ValidationPipe, real service, real database. The
 * only substitutions are the passport strategy (so ACTING_AS can switch
 * between three people) and the two outbound services with no credentials in a
 * test environment — the model and object storage — which are stubbed with
 * their real interfaces so both the "configured" and "not configured" paths
 * can be exercised deliberately rather than by accident.
 *
 *   # one-time: a database with the schema
 *   createdb rundesk_calls
 *   cd packages/db && DATABASE_URL=... pnpm exec drizzle-kit push --force
 *   psql $DATABASE_URL -f apps/api/test/calls-http-fixtures.sql
 *
 *   cd apps/api && pnpm build
 *   DATABASE_URL=... npx tsx test/calls-http.mts
 *
 * Runs in CI too — the `postgres-harnesses` job, against a Postgres service
 * built the same way. Built with `push` from the TypeScript schema on purpose:
 * that is how a new deployment is built, so a constraint living only in a
 * migration is missing here as well rather than quietly present.
 *
 * These checks have been proven to bite. Six defects were reintroduced into
 * the service one at a time and each was caught here, including the one that
 * matters most: deleting the `!call.recording` guard in appendTranscript —
 * which is the whole consent story — fails three of them, and the transcript
 * comes back containing the line that says "this must not be stored".
 */
import 'reflect-metadata'
import { Module, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import passport from 'passport'
import { DatabaseModule, DB_TOKEN } from '../dist/apps/api/src/common/database/database.module.js'
import { CallsModule } from '../dist/apps/api/src/modules/calls/calls.module.js'
import { CallsService } from '../dist/apps/api/src/modules/calls/calls.service.js'
import { ChatModule } from '../dist/apps/api/src/modules/chat/chat.module.js'
import { ChatService } from '../dist/apps/api/src/modules/chat/chat.service.js'
import { AiService } from '../dist/apps/api/src/modules/ai/ai.service.js'
import { R2Service } from '../dist/apps/api/src/common/storage/r2.service.js'
// @Global(), but only once it is in the graph — without it ChatModule's
// SearchModule cannot resolve FeatureFlagGuard's FeatureFlagsService.
import { FeatureFlagsModule } from '../dist/apps/api/src/modules/feature-flags/feature-flags.module.js'
import { FeatureFlagsService } from '../dist/apps/api/src/modules/feature-flags/feature-flags.service.js'

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const THEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const THIRD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const WS = '22222222-2222-4222-8222-222222222222'
const CHANNEL = '33333333-3333-4333-8333-333333333333'
const PORT = 3404
let ACTING_AS = ME

passport.use('jwt', {
  name: 'jwt',
  authenticate() {
    this.success({ id: ACTING_AS, role: 'member', activeWorkspaceId: WS })
  },
})

class Harness {}
Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    FeatureFlagsModule,
    CallsModule,
    ChatModule,
  ],
})(Harness)

let pass = 0
let fail = 0
const chk = (c, good, bad) =>
  c
    ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m ${good}`))
    : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m ${bad}`))

/**
 * Rows out of a raw execute.
 *
 * drizzle's postgres-js driver returns the rows as an array; other drivers wrap
 * them in `{ rows }`. Spelling that out once stops the harness depending on
 * which one is installed — the inline version of this was written five times
 * and got it wrong on the fifth.
 */
const rowsOf = (r) => (Array.isArray(r) ? r : (r?.rows ?? []))

/**
 * Wait for something that happens AFTER the response.
 *
 * The card and the call_started notifications are written by a fan-out that
 * start() deliberately does not await — nobody should queue behind hundreds of
 * sequential notification writes before being let into their own call. Reading
 * them the instant the POST returns is therefore a race the harness wins on a
 * warm local database and can lose on a busy one, and a harness whose whole
 * job is to be the trustworthy signal must not report a bug that is not there.
 *
 * Polls rather than sleeps, so the ordinary case costs one round trip. Gives up
 * and lets the assertion run — a timeout here is a real failure to report, not
 * something to hide behind a longer wait.
 */
const until = async (ready, ms = 4000) => {
  const deadline = Date.now() + ms
  for (;;) {
    if (await ready()) return true
    if (Date.now() > deadline) return false
    await new Promise((r) => setTimeout(r, 25))
  }
}

/** Read the recording flag straight from the row, not from a response body. */
let apiRecording = async () => false

const call = async (method, p, body) => {
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  const parsed = await res.json().catch(() => null)
  return { status: res.status, data: parsed?.data ?? parsed }
}

async function main() {
  // Nest's logger stays ON for errors.
  //
  // With `logger: false` a bootstrap failure — a missing env var, a provider
  // the graph cannot resolve — is swallowed entirely: the process exits 1
  // having printed nothing at all, which looks exactly like a harness that
  // does not work rather than an app that will not start. It cost a while to
  // find that the first time. Fastify's own request log stays off.
  const app = await NestFactory.create(Harness, new FastifyAdapter({ logger: false }), {
    logger: ['error', 'warn'],
  })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  await app.listen(PORT, '127.0.0.1')

  const db = app.get(DB_TOKEN)

  /*
   * The database this runs against must actually carry the constraint.
   *
   * Everything below about "two people pressing Start together land in ONE
   * call" is enforced by a partial unique index, not by the service — with the
   * index missing, `.onConflictDoNothing()` matches nothing and both inserts
   * succeed. That failure is silent, so a harness on a database without the
   * index would report the race closed while it was wide open. Checked here,
   * before a single check runs, and fatal rather than counted: this is not a
   * result, it is whether the results mean anything.
   */
  {
    const [idx] = rowsOf(
      await db.execute(
        `SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_calls_one_live_per_channel'`,
      ),
    )
    const def: string = idx?.indexdef ?? ''
    if (!def) {
      console.error(
        '\n✗ uq_calls_one_live_per_channel is missing from this database.\n' +
          '  Rebuild it from the TypeScript schema (drizzle-kit push --force) — the\n' +
          '  index is declared in packages/db/src/schema/calls.ts.',
      )
      process.exit(1)
    }
    if (!/ended_at IS NULL/i.test(def)) {
      console.error(`\n✗ uq_calls_one_live_per_channel does not exclude ended calls: ${def}`)
      process.exit(1)
    }
  }

  apiRecording = async (id) =>
    rowsOf(await db.execute(`SELECT recording FROM calls WHERE id = '${id}'`))[0]?.recording === true
  const calls = app.get(CallsService)
  const chat = app.get(ChatService)
  const flagsSvc = app.get(FeatureFlagsService)

  // Start from a known-empty state. A leftover live call would make start()
  // join it instead of creating one, and every count below would be off by
  // whatever an aborted run left behind.
  await db.execute('DELETE FROM call_transcript_lines')
  await db.execute('DELETE FROM call_participants')
  await db.execute('DELETE FROM chat_messages')
  await db.execute('DELETE FROM notifications')
  await db.execute('UPDATE calls SET meeting_id = NULL')
  await db.execute('DELETE FROM meeting_attendees')
  await db.execute('DELETE FROM meetings')
  await db.execute('DELETE FROM calls')
  // Feature flags too. feature-gate-http.mts runs against this same database
  // and leaves ai.meeting_notes switched OFF — which, now that the entitlement
  // is enforced server-side, made every recording check in this file fail. A
  // harness that depends on what another harness left behind is not a harness.
  await db.execute('DELETE FROM feature_flags')

  // The two services with no credentials here. Stubbed rather than left
  // unconfigured so BOTH branches are reachable on purpose.
  const ai = app.get(AiService)
  const r2 = app.get(R2Service)
  let aiAvailable = true
  let notesCalls = 0
  ai.isAvailable = () => aiAvailable
  ai.notesFromTranscript = async (transcript) => {
    notesCalls++
    return `## Summary\nFrom ${transcript.split('\n').length} line(s).`
  }
  let r2Configured = true
  Object.defineProperty(r2, 'configured', { get: () => r2Configured, configurable: true })
  r2.presignPutObject = async (key) => `https://r2.test/put/${key}`
  r2.getObjectUrl = async (key) => `https://r2.test/get/${key}`

  console.log('\n▶ starting a call — [19:40]')
  const started = await call('POST', `/workspaces/${WS}/calls`, {
    channelId: CHANNEL,
    // A field no DTO declares. The pipe must strip it rather than let a client
    // nominate somebody else as the person who started the call.
    startedById: THEM,
  })
  chk([200, 201].includes(started.status), 'a call starts', `start returned ${started.status}: ${JSON.stringify(started.data)?.slice(0, 200)}`)
  const callId = started.data?.id
  chk(started.data?.startedById === ME, 'started by the token, not the body', `startedById was ${started.data?.startedById}`)
  chk(started.data?.endedAt === null, 'and it is live', 'a new call came back ended')
  chk(started.data?.recording === false, 'and not recording', 'a new call started out recording')

  console.log('\n▶ pressing start again — the collision that is hardest to report')
  ACTING_AS = THEM
  const second = await call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL })
  chk(second.data?.id === callId, 'a second person joins the same call', `a second call was created (${second.data?.id})`)
  const presentNow = (second.data?.participants ?? []).filter((p) => !p.leftAt)
  chk(presentNow.length === 2, 'and both are in it', `${presentNow.length} present, expected 2`)

  console.log('\n▶ the card in the channel — [19:25] gap 9')
  ACTING_AS = ME
  // This is the query that has never run against Postgres: listMessages
  // hydrating each card with its call's live state.
  await until(async () => (await chat.listMessages(CHANNEL, ME)).some((m) => m.callId === callId))
  const messages = await chat.listMessages(CHANNEL, ME)
  const card = messages.find((m) => m.callId === callId)
  chk(!!card, 'starting a call posted a card into the channel', 'no call card was written')
  chk(!!card?.call, 'the card carries its call', 'the card has no hydrated call — the card cannot say which of the three states it is')
  chk(card?.call?.id === callId, 'pointing at the right call', `the card points at ${card?.call?.id}`)
  chk(card?.call?.presentCount === 2, `and counts who is in it (${card?.call?.presentCount})`, `presentCount was ${card?.call?.presentCount}, expected 2`)
  chk(card?.call?.youArePresent === true, 'and knows the reader is one of them', 'youArePresent was false for someone in the call')
  chk(typeof card?.body === 'string' && card.body.includes('Hamda'), 'with readable words naming who started it', `the card body was ${JSON.stringify(card?.body)}`)

  // The same card, read by the one person who never joined. Same row, different
  // answer — which is the whole reason this is hydrated per reader.
  const asThird = await chat.listMessages(CHANNEL, THIRD)
  const theirCard = asThird.find((m) => m.callId === callId)
  chk(theirCard?.call?.youArePresent === false, 'and reads as joinable to somebody who is not in it', 'a non-participant was told they were present')
  chk(theirCard?.call?.presentCount === 2, 'while still counting everyone who is', `presentCount was ${theirCard?.call?.presentCount} for a non-participant`)

  console.log('\n▶ who was told — the channel, not the workspace')
  const countTold = async () =>
    rowsOf(await db.execute(`SELECT count(*)::int AS n FROM notifications WHERE type = 'call_started'`))[0].n
  // One awaited round trip per member, and none of them on the request path.
  await until(async () => (await countTold()) >= 2)
  const notified = await db.execute(
    `SELECT user_id, type FROM notifications WHERE type = 'call_started'`,
  )
  const rows = rowsOf(notified)
  const told = new Set(rows.map((r) => r.user_id))
  chk(rows.length === 2, `two people were told (${rows.length})`, `${rows.length} notifications, expected 2`)
  chk(!told.has(ME), 'and not the person who started it', 'the starter was notified about their own call')
  chk(told.has(THEM) && told.has(THIRD), 'but every other channel member was', `told: ${[...told].join(', ')}`)

  console.log('\n▶ nothing is transcribed while the banner is down — gap 10')
  const refused = await call('POST', `/workspaces/${WS}/calls/${callId}/transcript`, {
    text: 'this must not be stored',
  })
  chk(refused.data?.ok === false && refused.data?.reason === 'not_recording', 'a line sent with recording off is refused', `it was accepted: ${JSON.stringify(refused.data)}`)
  const leaked = await db.execute('SELECT count(*)::int AS n FROM call_transcript_lines')
  chk(rowsOf(leaked)[0].n === 0, 'and nothing reached the table', 'a line was stored while recording was off')

  console.log('\n▶ turning it on announces itself, and marks everyone present')
  const rec = await call('POST', `/workspaces/${WS}/calls/${callId}/recording`, { recording: true })
  chk(rec.data?.recording === true, 'recording turns on', `it did not: ${JSON.stringify(rec.data)}`)
  const marked = await db.execute(
    'SELECT count(*)::int AS n FROM call_participants WHERE was_recorded = true',
  )
  chk(rowsOf(marked)[0].n === 2, 'and both people in the room are marked as recorded', `${rowsOf(marked)[0].n} marked, expected 2`)

  console.log('\n▶ and now the transcript is kept, attributed')
  chk((await call('POST', `/workspaces/${WS}/calls/${callId}/transcript`, { text: 'we should ship the meetings page on Friday' })).data?.ok === true, 'a line is kept', 'a line was refused while recording')
  ACTING_AS = THEM
  chk((await call('POST', `/workspaces/${WS}/calls/${callId}/transcript`, { text: 'I will send the deck' })).data?.ok === true, 'and so is a second speaker', "the second speaker's line was refused")
  ACTING_AS = ME
  chk((await call('POST', `/workspaces/${WS}/calls/${callId}/transcript`, { text: '   ' })).data?.ok === false, 'a blank line is not', 'whitespace was stored as an utterance')

  console.log('\n▶ the cap, read back from the row')
  {
    await call('POST', `/workspaces/${WS}/calls/${callId}/transcript`, { text: 'y'.repeat(9000) })
    const longest = rowsOf(
      await db.execute(`SELECT max(length(text))::int AS n FROM call_transcript_lines WHERE call_id = '${callId}'`),
    )[0].n
    chk(longest === 2000, `one utterance is capped at 2000 (${longest})`, `a line of ${longest} characters was stored`)
    await db.execute(`DELETE FROM call_transcript_lines WHERE length(text) = 2000`)
  }

  console.log('\n▶ a line the browser revises')
  {
    // Speech recognition re-emits a final result when it corrects one. Stored
    // as two lines, the notes report two commitments where there was one.
    await call('POST', `/workspaces/${WS}/calls/${callId}/transcript`, { text: 'and update' })
    await call('POST', `/workspaces/${WS}/calls/${callId}/transcript`, {
      text: 'and update the docs',
      replacesPrevious: true,
    })
    const t = (await call('GET', `/workspaces/${WS}/calls/${callId}/transcript`)).data?.transcript ?? ''
    chk(t.includes('and update the docs'), 'the revision is stored', `transcript: ${JSON.stringify(t)}`)
    chk(
      !/Hamda: and update$/m.test(t),
      'and the half-sentence it replaced is gone',
      `the transcript kept both halves: ${JSON.stringify(t)}`,
    )
  }

  // The join + order that has never run against Postgres.
  const read = await call('GET', `/workspaces/${WS}/calls/${callId}/transcript`)
  chk(
    (read.data?.transcript ?? '').startsWith('Hamda: we should ship the meetings page on Friday\nLeo: I will send the deck'),
    'the transcript reads back attributed and in order',
    `got ${JSON.stringify(read.data?.transcript)}`,
  )

  console.log('\n▶ the consent condition rides WITH the write')
  {
    /*
     * The pre-check and the insert are separate round-trips, so the statement
     * itself carries `recording = true and ended_at is null`. Proven by running
     * exactly that statement against a call whose banner is down — no
     * application code involved in the decision at all.
     *
     * The call row is inserted DIRECTLY rather than through start(), which
     * joins whatever is already live in the channel. Going through start()
     * handed this a call that was already recording and the check passed for
     * the wrong reason — the third time that trap has caught me in this file.
     */
    // Deliberately channel-less. This block only ever runs raw SQL, and since
    // 0111 a channel may hold at most one live call — inserting a second into
    // CHANNEL would now violate that index rather than test anything.
    const quietId = rowsOf(
      await db.execute(`
        INSERT INTO calls (workspace_id, started_by_id, recording)
        VALUES ('${WS}', '${ME}', false) RETURNING id
      `),
    )[0].id
    const wrote = rowsOf(
      await db.execute(`
        insert into call_transcript_lines (call_id, user_id, text)
        select '${quietId}', '${ME}', 'said with the banner down'
        where exists (
          select 1 from calls c
          where c.id = '${quietId}' and c.recording = true and c.ended_at is null
        )
        returning id
      `),
    )
    chk(wrote.length === 0, 'the database refuses a line when the call is not recording', 'the conditional write kept a line anyway')

    // And keeps one when it is — so the check above is not passing merely
    // because the statement is broken in both directions.
    await db.execute(`UPDATE calls SET recording = true WHERE id = '${quietId}'`)
    const kept = rowsOf(
      await db.execute(`
        insert into call_transcript_lines (call_id, user_id, text)
        select '${quietId}', '${ME}', 'said with the banner up'
        where exists (
          select 1 from calls c
          where c.id = '${quietId}' and c.recording = true and c.ended_at is null
        )
        returning id
      `),
    )
    chk(kept.length === 1, 'and keeps one when it is', 'the conditional write refuses everything')
    await db.execute(`DELETE FROM call_transcript_lines WHERE call_id = '${quietId}'`)
    await db.execute(`DELETE FROM calls WHERE id = '${quietId}'`)
  }

  console.log('\n▶ a channel member who never joined the call')
  {
    // The consent story is that everyone IN the call is told it is being
    // recorded. THIRD is in the channel and was never told anything.
    ACTING_AS = THIRD
    const peek = await call('GET', `/workspaces/${WS}/calls/${callId}/transcript`)
    chk(peek.status === 403, 'cannot read what is being said', `a bystander read the live transcript (${peek.status})`)
    ACTING_AS = ME
  }

  console.log('\n▶ a stranger to the channel')
  // assertCanReach resolves through channel membership. Everyone in the
  // fixtures is a member, so this proves the guard by removing one.
  await db.execute(`DELETE FROM chat_channel_members WHERE user_id = '${THIRD}'`)
  ACTING_AS = THIRD
  chk((await call('GET', `/workspaces/${WS}/calls/${callId}/transcript`)).status === 404, 'cannot read the transcript of a call in a channel they are not in', 'a non-member read the transcript')
  chk((await call('POST', `/workspaces/${WS}/calls/${callId}/transcript`, { text: 'let me in' })).status === 404, 'nor write to it', 'a non-member wrote to the transcript')
  await db.execute(`INSERT INTO chat_channel_members (channel_id, user_id) VALUES ('${CHANNEL}', '${THIRD}') ON CONFLICT DO NOTHING`)
  ACTING_AS = ME

  console.log('\n▶ where the recording goes — the media never passes through here')
  const upload = await call('POST', `/workspaces/${WS}/calls/${callId}/recording/upload-url`, {
    contentType: 'audio/webm',
  })
  chk(upload.status === 200, 'an upload URL is issued', `got ${upload.status}: ${JSON.stringify(upload.data)?.slice(0, 160)}`)
  chk(String(upload.data?.storageKey ?? '').startsWith(`calls/${WS}/${callId}/`), 'under a key scoped to this call', `key was ${upload.data?.storageKey}`)
  chk((await call('POST', `/workspaces/${WS}/calls/${callId}/recording/upload-url`, { contentType: 'application/zip' })).status === 400, 'a non-media content type is refused', 'a zip was accepted as a recording')
  chk((await call('POST', `/workspaces/${WS}/calls/${callId}/recording/attach`, { storageKey: `calls/${WS}/99999999-9999-4999-8999-999999999999/rec.webm` })).status === 400, "a key from another call is refused", "somebody else's recording could be attached")
  chk((await call('POST', `/workspaces/${WS}/calls/${callId}/recording/attach`, { storageKey: upload.data?.storageKey })).status === 200, 'and this call’s own key is accepted', 'the real key was refused')

  r2Configured = false
  chk((await call('POST', `/workspaces/${WS}/calls/${callId}/recording/upload-url`, { contentType: 'audio/webm' })).status === 400, 'with no storage configured it says so plainly', 'an upload URL was issued with no storage')
  r2Configured = true

  console.log('\n▶ uploading AFTER recording stops — the only order the client can use')
  // This is the check the first version of this harness got wrong. It asked for
  // an upload URL while recording was still on, which the browser can never do:
  // MediaRecorder only produces a file when it stops, and the only thing that
  // stops it is recording being switched off. Asking in the realistic order
  // showed the endpoint refusing every recording ever made.
  await call('POST', `/workspaces/${WS}/calls/${callId}/recording`, { recording: false })
  const afterStop = await call('POST', `/workspaces/${WS}/calls/${callId}/recording/upload-url`, {
    contentType: 'audio/webm',
  })
  chk(afterStop.status === 200, 'is still allowed once the banner comes down', `it was refused with ${afterStop.status} — every recording would be silently lost`)
  chk((await call('POST', `/workspaces/${WS}/calls/${callId}/recording/attach`, { storageKey: afterStop.data?.storageKey })).status === 200, 'and the file can be handed in', 'the finished recording could not be attached')


  console.log('\n▶ ending it — the record it leaves behind')
  const ended = await call('POST', `/workspaces/${WS}/calls/${callId}/end`, {})
  chk(!!ended.data?.meetingId, 'ending leaves a meeting record', `no record: ${JSON.stringify(ended.data)}`)
  chk(notesCalls === 1, 'and the notes are written from the transcript', `the model was asked ${notesCalls} time(s)`)

  const meeting = await db.execute(`SELECT * FROM meetings WHERE id = '${ended.data?.meetingId}'`)
  const m = rowsOf(meeting)[0]
  chk(String(m.transcript ?? '').includes('Hamda: we should ship'), 'the record carries the transcript', `transcript was ${JSON.stringify(String(m.transcript ?? '').slice(0, 80))}`)
  chk(String(m.notes ?? '').includes('## Summary'), 'and the notes', `notes were ${JSON.stringify(String(m.notes ?? '').slice(0, 80))}`)
  // The KEY, not a signed URL — a signed R2 URL lasts fifteen minutes, so one
  // written into this column is dead before the notes are read once.
  chk(String(m.recording_url ?? '').startsWith(`calls/${WS}/${callId}/`), 'and points at the recording by durable key', `recording_url was ${m.recording_url}`)
  chk(!String(m.recording_url ?? '').includes('://'), 'not a signed URL that expires', `recording_url is a URL: ${m.recording_url}`)

  const attendees = await db.execute(
    `SELECT count(*)::int AS n FROM meeting_attendees WHERE meeting_id = '${ended.data?.meetingId}'`,
  )
  chk(rowsOf(attendees)[0].n >= 2, 'with everyone who was there', `${rowsOf(attendees)[0].n} attendees`)

  console.log('\n▶ a recording that lands AFTER the call ended')
  {
    // The upload only begins when the recorder stops, so it routinely finishes
    // after end() has written the meeting — especially on "End for all", which
    // does both in the same moment.
    const late = `calls/${WS}/${callId}/recording-late.webm`
    chk((await call('POST', `/workspaces/${WS}/calls/${callId}/recording/attach`, { storageKey: late })).status === 200, 'is still accepted', 'a late upload was refused')
    const segments = rowsOf(
      await db.execute(`SELECT storage_key FROM call_recordings WHERE call_id = '${callId}' ORDER BY position`),
    ).map((r) => r.storage_key)
    chk(segments.includes(late), 'and is kept as another piece of the recording', 'the late upload was dropped')

    // The meeting keeps pointing at the FIRST piece. Overwriting it with each
    // late arrival is what orphaned the earlier audio in the first place.
    const url = rowsOf(await db.execute(`SELECT recording_url FROM meetings WHERE id = '${ended.data?.meetingId}'`))[0].recording_url
    chk(url === segments[0], 'while the meeting still points at the first', `the meeting points at ${url}, first piece is ${segments[0]}`)
  }

  console.log('\n▶ a call that ended with no recording, then one arrives')
  {
    // The backfill still has to happen when there was nothing to point at.
    const orphan = await call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL, title: 'late only' })
    const id = orphan.data?.id
    await call('POST', `/workspaces/${WS}/calls/${id}/recording`, { recording: true })
    const done = await call('POST', `/workspaces/${WS}/calls/${id}/end`, {})
    const key = `calls/${WS}/${id}/recording-after-the-fact.webm`
    await call('POST', `/workspaces/${WS}/calls/${id}/recording/attach`, { storageKey: key })
    const url = rowsOf(await db.execute(`SELECT recording_url FROM meetings WHERE id = '${done.data?.meetingId}'`))[0].recording_url
    chk(url === key, 'is backfilled onto the meeting record', `the meeting points at ${url}`)
  }

  console.log('\n▶ the card, now that the call is over')
  const after = await chat.listMessages(CHANNEL, ME)
  const endedCard = after.find((m) => m.callId === callId)
  chk(!!endedCard?.call?.endedAt, 'the same card reports the call as ended', 'the card still shows a live call — its Join button would drop people into a closed room')
  chk(endedCard?.call?.joinedCount === 2, `and how many ever joined (${endedCard?.call?.joinedCount})`, `joinedCount was ${endedCard?.call?.joinedCount}`)
  chk((await call('GET', `/workspaces/${WS}/calls/live?channelId=${CHANNEL}`)).data == null, 'and the channel stops offering it', 'an ended call is still reported live')

  console.log('\n▶ a call that ends with nobody having spoken')
  notesCalls = 0
  const quiet = await call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL })
  await call('POST', `/workspaces/${WS}/calls/${quiet.data?.id}/end`, {})
  chk(notesCalls === 0, 'is not given invented notes', 'the model was asked to summarise a silent call')

  console.log('\n▶ a call that ends with no model configured')
  aiAvailable = false
  const noModel = await call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL })
  await call('POST', `/workspaces/${WS}/calls/${noModel.data?.id}/recording`, { recording: true })
  await call('POST', `/workspaces/${WS}/calls/${noModel.data?.id}/transcript`, { text: 'something was said' })
  const endedNoModel = await call('POST', `/workspaces/${WS}/calls/${noModel.data?.id}/end`, {})
  chk(!!endedNoModel.data?.meetingId, 'still ends, and still leaves a record', 'a missing model stopped the call ending')
  const m2 = rowsOf(await db.execute(`SELECT * FROM meetings WHERE id = '${endedNoModel.data?.meetingId}'`))[0]
  chk(String(m2.transcript ?? '').includes('something was said'), 'keeping the transcript', 'the transcript was lost when no model was configured')
  chk(m2.notes === null, 'with no notes rather than empty ones', `notes were ${JSON.stringify(m2.notes)}`)
  aiAvailable = true

  console.log('\n▶ a call that was never recorded at all')
  {
    // start() JOINS a call already running in the channel, so this has to run
    // where none is — otherwise it silently inherits the recorded one and the
    // check passes for the wrong reason. Asserting the id makes that
    // impossible rather than merely unlikely.
    const fresh = await call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL })
    chk(fresh.data?.id !== callId, 'is genuinely a new call', 'it joined the recorded one — this check would prove nothing')
    chk(
      (await call('POST', `/workspaces/${WS}/calls/${fresh.data?.id}/recording/upload-url`, { contentType: 'audio/webm' })).status === 400,
      'and is refused an upload URL',
      'a call nobody recorded could still hand in a recording',
    )
    await call('POST', `/workspaces/${WS}/calls/${fresh.data?.id}/end`, {})
  }

  console.log('\n▶ the entitlement, enforced on the server and not just the browser')
  {
    // Must run where NO call is live. start() joins one that is, and the call
    // running earlier in this file is already recording — so setRecording
    // early-returns "already on" and never reaches the gate at all. That is
    // exactly how the first version of this check passed for the wrong reason.
    const off = await call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL, title: 'gated' })
    chk(off.data?.id !== callId, 'is a fresh call, not the recorded one', 'it joined a live call — this check would prove nothing')
    chk((await apiRecording(off.data?.id)) === false, 'and is not already recording', 'the fresh call was already recording')

    /*
     * Switched off through setFlag — the path an admin actually takes.
     *
     * FeatureFlagsService caches resolved flags for five minutes per
     * user+workspace, and setFlag is what invalidates that cache. Writing the
     * row straight to the table changes the database and tells nothing.
     *
     * Worth knowing beyond this test: that invalidation is in-process, so on a
     * multi-instance deployment the other instances keep serving the old value
     * until the TTL expires. Pre-existing behaviour of every flag in the
     * system, not something this feature introduced.
     */
    await db.execute(`UPDATE workspace_members SET role = 'workspace_admin' WHERE user_id = '${ME}' AND workspace_id = '${WS}'`)
    await flagsSvc.setFlag('ai.meeting_notes', false, 'workspace', WS, WS, { id: ME, role: 'workspace_admin' })

    const refused = await call('POST', `/workspaces/${WS}/calls/${off.data?.id}/recording`, { recording: true })
    chk(refused.status === 403, 'recording is refused when the workspace has AI Notes off', `it was allowed (${refused.status}) — the gate is browser-only`)
    chk((await apiRecording(off.data?.id)) === false, 'and the call is genuinely not recording', 'the flag was written despite the refusal')

    await flagsSvc.setFlag('ai.meeting_notes', true, 'workspace', WS, WS, { id: ME, role: 'workspace_admin' })
    const allowedAgain = await call('POST', `/workspaces/${WS}/calls/${off.data?.id}/recording`, { recording: true })
    chk(allowedAgain.status === 200, 'and allowed again once an admin turns it back on', `still refused: ${allowedAgain.status}`)

    await db.execute(`UPDATE workspace_members SET role = 'member' WHERE user_id = '${ME}' AND workspace_id = '${WS}'`)
    await db.execute('DELETE FROM feature_flags')
    await call('POST', `/workspaces/${WS}/calls/${off.data?.id}/end`, {})
  }

  console.log('\n▶ two people pressing Start SyncUp at the same instant')
  {
    // The read-then-insert in start() let both requests through, so the channel
    // got two live calls, two cards and two notification storms. Fired
    // concurrently — sequential presses always passed, which is why this was
    // never caught.
    const both = await Promise.all([
      call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL }),
      call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL }),
    ])
    // BOTH must succeed. Filtering out failures first made a 500 for the loser
    // indistinguishable from both landing in one call — which is exactly what
    // happens without onConflictDoNothing, since the losing insert violates the
    // unique index. Somebody pressing Start and getting an error is not a fix.
    chk(
      both.every((r) => r.status === 200 || r.status === 201),
      'both requests succeed',
      `statuses: ${both.map((r) => r.status).join(', ')} — the loser got an error instead of the call`,
    )
    const ids = [...new Set(both.map((r) => r.data?.id).filter(Boolean))]
    chk(ids.length === 1 && both.every((r) => r.data?.id === ids[0]), 'and both land in ONE call', `ids: ${both.map((r) => r.data?.id).join(', ')}`)
    const live = rowsOf(
      await db.execute(`SELECT count(*)::int AS n FROM calls WHERE channel_id = '${CHANNEL}' AND ended_at IS NULL`),
    )[0].n
    chk(live === 1, 'and the channel has exactly one live call', `${live} live calls in the channel`)
    await call('POST', `/workspaces/${WS}/calls/${ids[0]}/end`, {})
  }

  console.log('\n▶ two people hanging up at the same instant')
  {
    const shared = await call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL })
    const before = rowsOf(await db.execute('SELECT count(*)::int AS n FROM meetings'))[0].n
    const ends = await Promise.all([
      call('POST', `/workspaces/${WS}/calls/${shared.data?.id}/end`, {}),
      call('POST', `/workspaces/${WS}/calls/${shared.data?.id}/end`, {}),
    ])
    const after = rowsOf(await db.execute('SELECT count(*)::int AS n FROM meetings'))[0].n
    chk(after - before === 1, 'leave exactly ONE meeting record', `${after - before} records were written — and each one is a billed AI-notes run`)
    const meetingIds = [...new Set(ends.map((e) => e.data?.meetingId).filter(Boolean))]
    chk(meetingIds.length === 1, 'and both callers are told about the same one', `they were told about ${meetingIds.length}`)
    /*
     * And neither caller is told nothing at all.
     *
     * The loser of the claim re-reads the row while the winner is still
     * generating notes, so meeting_id is usually still NULL there — reported
     * as a plain null, the loser's browser concluded no record was kept and
     * said nothing. Every response has to name a state: an id, or `pending`.
     */
    chk(
      ends.every((e) => Boolean(e.data?.meetingId) || e.data?.pending === true),
      'and neither is told nothing at all',
      `responses: ${ends.map((e) => JSON.stringify(e.data)).join(' | ')}`,
    )
  }

  console.log('\n▶ a call that ended without ever leaving a record')
  {
    /*
     * The claim commits on its own, and everything that WRITES the record runs
     * after it — including an outbound model call that takes seconds. A crash
     * or a deploy in that window used to end the call permanently with nothing
     * to show for it: the guard at the top of end() returned `{ ok: true,
     * meetingId: null }` forever and the transcript, notes, attendees and
     * recording were unreachable from Meetings.
     *
     * The row is put into that state with SQL rather than by killing the
     * process, because the state is the point — not how it was reached.
     */
    const lost = await call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL, title: 'interrupted' })
    const id = lost.data?.id
    await call('POST', `/workspaces/${WS}/calls/${id}/recording`, { recording: true })
    await call('POST', `/workspaces/${WS}/calls/${id}/transcript`, { text: 'we agreed to ship on Friday' })
    await db.execute(`UPDATE calls SET ended_at = now(), meeting_id = NULL WHERE id = '${id}'`)

    const before = rowsOf(await db.execute('SELECT count(*)::int AS n FROM meetings'))[0].n
    const again = await call('POST', `/workspaces/${WS}/calls/${id}/end`, {})
    const after = rowsOf(await db.execute('SELECT count(*)::int AS n FROM meetings'))[0].n
    chk(Boolean(again.data?.meetingId), 'ending it again writes the record that was owed', 'the call stayed ended with nothing to show for it')
    chk(after - before === 1, 'exactly one record', `${after - before} records were written`)
    const pointsAt = rowsOf(await db.execute(`SELECT meeting_id FROM calls WHERE id = '${id}'`))[0].meeting_id
    chk(pointsAt === again.data?.meetingId, 'and the call points at it', `the call points at ${pointsAt}`)
    const kept = rowsOf(
      await db.execute(`SELECT transcript FROM meetings WHERE id = '${again.data?.meetingId}'`),
    )[0].transcript
    chk(typeof kept === 'string' && kept.includes('Friday'), 'with the transcript it was owed', `transcript came back as ${JSON.stringify(kept)?.slice(0, 80)}`)

    // And now that the record exists, ending it again is the no-op it always was.
    const third = await call('POST', `/workspaces/${WS}/calls/${id}/end`, {})
    const settled = rowsOf(await db.execute('SELECT count(*)::int AS n FROM meetings'))[0].n
    chk(settled === after, 'ending it once more writes nothing further', `${settled - after} extra records`)
    chk(third.data?.meetingId === again.data?.meetingId, 'and names the same record', `it named ${third.data?.meetingId}`)
  }

  console.log('\n▶ pressing Start while the call in the way is ending')
  {
    /*
     * start() loses the insert to the live call, then re-reads the channel to
     * join it — two statements, so the call it lost to can finish in between.
     * The re-read then comes back empty and the press used to be answered with
     * 400 "Could not start a call here", with no live call in the channel and
     * nothing wrong with the press.
     *
     * This is a race, so the assertion is the invariant that has to hold under
     * every interleaving rather than one particular outcome: joining the live
     * call and starting a fresh one are both right, and an error is not.
     */
    const attempts: number[] = []
    for (let i = 0; i < 6; i += 1) {
      const live = await call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL })
      const [, pressed] = await Promise.all([
        call('POST', `/workspaces/${WS}/calls/${live.data?.id}/end`, {}),
        call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL }),
      ])
      attempts.push(pressed.status)
      if (pressed.data?.id) await call('POST', `/workspaces/${WS}/calls/${pressed.data.id}/end`, {})
    }
    chk(
      attempts.every((s) => s === 200 || s === 201),
      'is never answered with an error',
      `statuses across six attempts: ${attempts.join(', ')}`,
    )
  }

  console.log('\n▶ a recording stopped and restarted')
  {
    const seg = await call('POST', `/workspaces/${WS}/calls`, { channelId: CHANNEL, title: 'segments' })
    const id = seg.data?.id
    await call('POST', `/workspaces/${WS}/calls/${id}/recording`, { recording: true })
    const one = `calls/${WS}/${id}/recording-1.webm`
    const two = `calls/${WS}/${id}/recording-2.webm`
    await call('POST', `/workspaces/${WS}/calls/${id}/recording/attach`, { storageKey: one })
    await call('POST', `/workspaces/${WS}/calls/${id}/recording/attach`, { storageKey: two })
    const kept = rowsOf(
      await db.execute(`SELECT storage_key FROM call_recordings WHERE call_id = '${id}' ORDER BY position`),
    ).map((r) => r.storage_key)
    chk(kept.length === 2, 'keeps BOTH pieces', `${kept.length} kept — the earlier audio is orphaned in storage`)
    chk(kept[0] === one && kept[1] === two, 'in the order they were captured', `got ${kept.join(', ')}`)
    // Handing the same key in twice is a retry, not a third segment.
    await call('POST', `/workspaces/${WS}/calls/${id}/recording/attach`, { storageKey: two })
    const again = rowsOf(await db.execute(`SELECT count(*)::int AS n FROM call_recordings WHERE call_id = '${id}'`))[0].n
    chk(again === 2, 'and a retry of the same key is not a new piece', `${again} rows after a retry`)
    const first = rowsOf(await db.execute(`SELECT recording_storage_key FROM calls WHERE id = '${id}'`))[0].recording_storage_key
    chk(first === one, 'the call still points at the FIRST piece', `it points at ${first}`)

    /*
     * Two pieces finishing together.
     *
     * The position used to be read in one statement and written in the next,
     * so two attaches landing together both read the same maximum and both
     * claimed it — "the pieces in order" became two pieces claiming to be the
     * same one. Both halves are checked: both requests must SUCCEED (an insert
     * that raises on the unique index is not a fix), and the two pieces must
     * end up in different places.
     */
    const three = `calls/${WS}/${id}/recording-3.webm`
    const four = `calls/${WS}/${id}/recording-4.webm`
    const together = await Promise.all([
      call('POST', `/workspaces/${WS}/calls/${id}/recording/attach`, { storageKey: three }),
      call('POST', `/workspaces/${WS}/calls/${id}/recording/attach`, { storageKey: four }),
    ])
    chk(
      together.every((r) => r.status === 200 || r.status === 201),
      'two pieces landing together both attach',
      `statuses: ${together.map((r) => r.status).join(', ')}`,
    )
    const positions = rowsOf(
      await db.execute(`SELECT position FROM call_recordings WHERE call_id = '${id}' ORDER BY position`),
    ).map((r) => r.position)
    chk(positions.length === 4, 'and all four pieces are kept', `${positions.length} kept: ${positions.join(', ')}`)
    chk(
      new Set(positions).size === positions.length,
      'each in its own place in the order',
      `positions: ${positions.join(', ')} — two pieces claim the same one`,
    )

    /*
     * The tie itself, forced rather than hoped for.
     *
     * Two attaches landing together only collide inside a window measured in
     * microseconds, so the check above can pass without ever having a
     * collision to survive. This makes one: a second connection holds an
     * UNCOMMITTED row at the next free position, so the attach cannot see it,
     * computes the same position and blocks on the unique index. Releasing the
     * holder turns that block into a duplicate-key error — which is exactly
     * what the retry exists for, and the only thing standing between it and a
     * 500 on a perfectly ordinary upload.
     */
    let release = () => {}
    const held = new Promise((r) => (release = r))
    const nextFree = Math.max(...positions) + 1
    const holding = db
      .transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO call_recordings (call_id, storage_key, position) VALUES ('${id}', 'held', ${nextFree})`,
        )
        await held
      })
      .catch(() => undefined)
    const five = `calls/${WS}/${id}/recording-5.webm`
    const racing = call('POST', `/workspaces/${WS}/calls/${id}/recording/attach`, { storageKey: five })
    await new Promise((r) => setTimeout(r, 400))
    release()
    await holding
    const raced = await racing
    chk(
      raced.status === 200 || raced.status === 201,
      'a piece that loses the position outright still attaches',
      `it came back ${raced.status} — the upload is in storage and the row is not`,
    )
    const after = rowsOf(
      await db.execute(`SELECT storage_key, position FROM call_recordings WHERE call_id = '${id}' ORDER BY position`),
    )
    chk(
      after.some((r) => r.storage_key === five && r.position === nextFree + 1),
      'and takes the next place rather than fighting for the taken one',
      `rows: ${after.map((r) => `${r.position}:${r.storage_key.split('/').pop()}`).join(', ')}`,
    )

    await call('POST', `/workspaces/${WS}/calls/${id}/end`, {})

    /*
     * §2.8 — and every piece is REACHABLE.
     *
     * call_recordings was written and never read: no service selected from it,
     * no route exposed it, no screen showed it. The meeting still offered the
     * single key on `meetings.recordingUrl`, so the second and later pieces
     * were bytes in storage that nothing could get to — the fix for "the first
     * piece was orphaned" had only changed WHICH piece was orphaned.
     */
    const meetingId = rowsOf(await db.execute(`SELECT meeting_id FROM calls WHERE id = '${id}'`))[0].meeting_id
    const listed = await call('GET', `/workspaces/${WS}/meetings`)
    const record = (listed.data ?? []).find((m: { id: string }) => m.id === meetingId)
    chk(Boolean(record), 'the call left a record in Meetings', `no meeting ${meetingId} in the list`)
    // Counted from the table rather than written down: the checks above add
    // pieces deliberately, and a number typed in here would go stale the next
    // time one is added and then quietly be adjusted to match whatever the
    // code did.
    const captured = rowsOf(
      await db.execute(`SELECT count(*)::int AS n FROM call_recordings WHERE call_id = '${id}'`),
    )[0].n
    chk(captured > 1, `the call has ${captured} pieces to offer`, 'the segment checks above left nothing to reach')
    chk(
      Array.isArray(record?.recordings) && record.recordings.length === captured,
      'and it offers every piece that was captured',
      `it offers ${record?.recordings?.length ?? 0} of ${captured}`,
    )
    chk(
      (record?.recordings ?? []).every((u: string) => u.startsWith('https://r2.test/get/')),
      'each one signed, not a bare storage key',
      `it handed back ${JSON.stringify(record?.recordings)?.slice(0, 160)}`,
    )
    /*
     * The single link the meetings page has always rendered is signed too.
     * Only the single-meeting read signed it; the LIST — the one place
     * recordings are actually browsed — handed out the raw key, which the
     * browser resolves against the current page and 404s.
     */
    chk(
      typeof record?.recordingUrl === 'string' && record.recordingUrl.startsWith('https://r2.test/get/'),
      'and so is the single link the list has always shown',
      `recordingUrl came back as ${JSON.stringify(record?.recordingUrl)}`,
    )
  }

  console.log('\n▶ recording a call that has ended')
  chk((await call('POST', `/workspaces/${WS}/calls/${callId}/recording`, { recording: true })).status === 400, 'is refused', 'an ended call could be put back into recording')
  chk((await call('POST', `/workspaces/${WS}/calls/${callId}/transcript`, { text: 'after the fact' })).data?.reason === 'ended', 'and so is transcribing it', 'a line was accepted after the call ended')

  console.log(`\n${pass} passed, ${fail} failed`)
  await app.close()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nthrew:', e?.message ?? e)
  console.error(e?.stack?.split('\n').slice(1, 6).join('\n'))
  process.exit(1)
})
