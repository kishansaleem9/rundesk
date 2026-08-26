/**
 * §2.8 gap 11 — "Contact your admin", against real Postgres.
 *
 * The once-a-day rule is the reason this file exists, and both ways it can be
 * wrong are silent. If it never matches, every press of the button rings every
 * admin again. If it matches too much, the first request anybody makes silences
 * the feature for everyone — nobody is ever told, and the button reports
 * success while doing nothing.
 *
 * It used to be a raw JSON operator inside a drizzle template —
 * `sql`${notifications.target} ->> 'entityId' = ${flagKey}`` — which this file
 * was written to pin down. It reads from `feature_flag_requests` now (0113),
 * because looking for a notification row could never see an ask whose
 * recipients all take email: the rule simply never tripped for them. Same two
 * failure modes, so the same checks still earn their place, plus the
 * email-only workspace that had nothing watching it.
 *
 * Neither shows up in a unit test with a fake database, because the fake is the
 * thing deciding whether the predicate matched.
 *
 *   createdb rundesk_calls   # same database as calls-http.mts
 *   cd packages/db && DATABASE_URL=... pnpm exec drizzle-kit push --force
 *   psql $DATABASE_URL -f apps/api/test/calls-http-fixtures.sql
 *
 *   cd apps/api && pnpm build
 *   DATABASE_URL=... npx tsx test/feature-gate-http.mts
 *
 * Runs in CI too — the `postgres-harnesses` job. Either order with
 * calls-http.mts: each resets what it depends on rather than inheriting it.
 */
import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { DatabaseModule, DB_TOKEN } from '../dist/apps/api/src/common/database/database.module.js'
import { FeatureFlagsModule } from '../dist/apps/api/src/modules/feature-flags/feature-flags.module.js'
import { FeatureFlagsService } from '../dist/apps/api/src/modules/feature-flags/feature-flags.service.js'

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const THEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const THIRD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const WS = '22222222-2222-4222-8222-222222222222'
const FLAG = 'ai.meeting_notes'

class Harness {}
Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, FeatureFlagsModule] })(
  Harness,
)

let pass = 0
let fail = 0
const chk = (c, good, bad) =>
  c
    ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m ${good}`))
    : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m ${bad}`))

const rowsOf = (r) => (Array.isArray(r) ? r : (r?.rows ?? []))

async function main() {
  // Errors stay visible — see calls-http.mts on why `logger: false` is a trap.
  const app = await NestFactory.create(Harness, new FastifyAdapter({ logger: false }), {
    logger: ['error'],
  })
  await app.init()

  const db = app.get(DB_TOKEN)
  const svc = app.get(FeatureFlagsService)

  const reset = async () => {
    await db.execute('DELETE FROM notifications')
    // The ask is now recorded in its own right rather than inferred from the
    // notifications it produced, so it has to be cleared here too — otherwise
    // every section after the first reads as a repeat press.
    await db.execute('DELETE FROM feature_flag_requests')
    await db.execute('DELETE FROM feature_flags')
    // NOT NULL with a default of {} — the merge treats an empty object as
    // "nothing chosen", which is the same as untouched.
    await db.execute(`UPDATE users SET notification_preferences = '{}'::jsonb`)
    svc.invalidateCache()
  }
  /** Set one person's channel matrix for the `activity` events this uses. */
  const prefer = async (userId, events, channels = {}) =>
    db.execute(
      `UPDATE users SET notification_preferences = '${JSON.stringify({
        events: { activity: events },
        channels,
      })}'::jsonb WHERE id = '${userId}'`,
    )
  const notifications = async () => rowsOf(await db.execute('SELECT * FROM notifications'))

  // Two admins to ask, and the requester is deliberately a plain member.
  await db.execute(
    `UPDATE workspace_members SET role = 'workspace_admin' WHERE user_id IN ('${THEM}', '${THIRD}')`,
  )
  await db.execute(`UPDATE workspace_members SET role = 'member' WHERE user_id = '${ME}'`)

  console.log('\n▶ asking for something that is already on')
  await reset()
  // ai.meeting_notes is in DEFAULT_ENABLED_FLAGS, so with no override it is on.
  const already = await svc.requestFlag(FLAG, WS, { id: ME, name: 'Hamda' })
  chk(already.status === 'already_enabled', 'is refused as already enabled', `got ${already.status}`)
  chk((await notifications()).length === 0, 'and rings nobody', 'an admin was chased for a toggle already on')

  console.log('\n▶ asking for something an admin switched off')
  await reset()
  await db.execute(
    `INSERT INTO feature_flags (flag_key, scope, scope_id, workspace_id, enabled)
     VALUES ('${FLAG}', 'workspace', '${WS}', '${WS}', false)`,
  )
  svc.invalidateCache()
  const sent = await svc.requestFlag(FLAG, WS, { id: ME, name: 'Hamda' })
  chk(sent.status === 'sent', 'is sent', `got ${sent.status}`)
  chk(sent.notified === 2, `to both admins (${sent.notified})`, `notified ${sent.notified}, expected 2`)

  const rows = await notifications()
  chk(rows.length === 2, 'and two rows were written', `${rows.length} rows`)
  // Named exactly. Accepting "either of these two" would have passed with the
  // wrong type written, which is the whole thing this line is for.
  chk(rows.every((r) => r.type === 'access_requested'), 'typed as an access request', `types: ${rows.map((r) => r.type).join(',')}`)
  chk(rows.every((r) => r.actor_id === ME), 'attributed to the person asking', 'the actor is wrong')
  chk(!rows.some((r) => r.user_id === ME), 'and not sent to them', 'the requester was notified about their own request')
  chk(rows.every((r) => (r.target?.entityId ?? JSON.parse(r.target ?? '{}').entityId) === FLAG), 'carrying the flag as its target', `target: ${JSON.stringify(rows[0]?.target)}`)

  console.log('\n▶ pressing it again the same day')
  // THE query this file exists for. If the ->> predicate never matches, this
  // says "sent" and rings both admins a second time.
  const again = await svc.requestFlag(FLAG, WS, { id: ME, name: 'Hamda' })
  chk(again.status === 'already_asked', 'is recognised as a repeat', `got ${again.status} — the once-a-day predicate did not match`)
  chk((await notifications()).length === 2, 'and rings nobody a second time', `${(await notifications()).length} rows after a repeat press`)

  console.log('\n▶ a DIFFERENT feature, same person, same day')
  // The other way the predicate can be wrong: matching everything, so the
  // first request anybody makes silences every other feature for a day.
  await db.execute(
    `INSERT INTO feature_flags (flag_key, scope, scope_id, workspace_id, enabled)
     VALUES ('ai.summaries', 'workspace', '${WS}', '${WS}', false)`,
  )
  svc.invalidateCache()
  const other = await svc.requestFlag('ai.summaries', WS, { id: ME, name: 'Hamda' })
  chk(other.status === 'sent', 'is a separate request, not a repeat', `got ${other.status} — the predicate matches too much`)
  chk((await notifications()).length === 4, 'and does ring the admins', `${(await notifications()).length} rows`)

  console.log('\n▶ a different PERSON asking for the same feature')
  const theirs = await svc.requestFlag(FLAG, WS, { id: THIRD, name: 'Suleman' })
  chk(theirs.status === 'sent', "is not silenced by somebody else's request", `got ${theirs.status}`)

  console.log('\n▶ admins who take email and nothing else')
  {
    /*
     * The configuration the whole "delivery, not rows" change was about, and
     * the one nothing tested. An admin with in-app off and email on gets the
     * mail and produces NO notification row — so counting rows called them
     * nobody, and a once-a-day rule that looked for a row had nothing to find
     * and let the same press mail them again on every reload.
     */
    await reset()
    await db.execute(
      `INSERT INTO feature_flags (flag_key, scope, scope_id, workspace_id, enabled) VALUES ('${FLAG}', 'workspace', '${WS}', '${WS}', false)`,
    )
    const emailOnly = { inApp: false, web: false, mobile: false, email: true }
    await prefer(THEM, emailOnly)
    await prefer(THIRD, emailOnly)
    svc.invalidateCache()

    const mailed = await svc.requestFlag(FLAG, WS, { id: ME, name: 'Hamda' })
    chk(mailed.status === 'sent', 'the request is sent', `got ${mailed.status}`)
    chk(mailed.notified === 2, `and both admins count as told (${mailed.notified})`, `notified ${mailed.notified} — an admin who got the mail was counted as nobody`)
    chk((await notifications()).length === 0, 'with no in-app row anywhere', 'a row was written for somebody who has in-app off')

    const repeat = await svc.requestFlag(FLAG, WS, { id: ME, name: 'Hamda' })
    chk(repeat.status === 'already_asked', 'and pressing again the same day is a repeat', `got ${repeat.status} — the once-a-day rule never trips for email-only admins, so every reload mails them again`)
  }

  console.log('\n▶ an email-only admin inside their quiet hours')
  {
    /*
     * Nothing goes out at all: no row (in-app off), no mail (quiet hours), no
     * push (web/mobile off). Counting a channel being ENABLED as delivery told
     * the requester "we told them" and then refused them a second ask — for a
     * message that was never sent.
     *
     * dndStart == dndEnd is the service's own "always" (isInQuietHours), which
     * keeps this from depending on what time the suite runs.
     */
    await reset()
    await db.execute(
      `INSERT INTO feature_flags (flag_key, scope, scope_id, workspace_id, enabled) VALUES ('${FLAG}', 'workspace', '${WS}', '${WS}', false)`,
    )
    const silent = { inApp: false, web: false, mobile: false, email: true }
    const allDay = { dndOn: true, dndStart: '09:00', dndEnd: '09:00' }
    await prefer(THEM, silent, allDay)
    await prefer(THIRD, silent, allDay)
    svc.invalidateCache()

    const quiet = await svc.requestFlag(FLAG, WS, { id: ME, name: 'Hamda' })
    chk(quiet.notified === 0, 'nobody is counted as told', `notified ${quiet.notified} — nothing was sent to either of them`)
    chk((await notifications()).length === 0, 'and nothing was written either', 'a row appeared for an admin with in-app off')
    // notified === 0 is what the browser reads to say "we could not reach
    // anyone" instead of "we told them", and to leave the button pressable.
    chk(quiet.status === 'sent', 'the request itself still happened', `got ${quiet.status}`)
  }

  console.log('\n▶ input the service must refuse')
  await assertRejects(() => svc.requestFlag('not.a.real.flag', WS, { id: ME }), /Unknown feature/, 'an invented flag is refused')
  await assertRejects(
    () => svc.requestFlag(FLAG, '99999999-9999-4999-8999-999999999999', { id: ME }),
    /Not a member/,
    'a workspace the caller is not in is refused',
  )

  console.log('\n▶ a workspace with no other admin')
  await reset()
  await db.execute(`INSERT INTO feature_flags (flag_key, scope, scope_id, workspace_id, enabled) VALUES ('${FLAG}', 'workspace', '${WS}', '${WS}', false)`)
  await db.execute(`UPDATE workspace_members SET role = 'member' WHERE workspace_id = '${WS}'`)
  svc.invalidateCache()
  const alone = await svc.requestFlag(FLAG, WS, { id: ME, name: 'Hamda' })
  chk(alone.status === 'no_admins', 'says there is nobody to ask', `got ${alone.status}`)
  chk((await notifications()).length === 0, 'rather than reporting a send that reached nobody', 'notifications were written with no admins')

  console.log(`\n${pass} passed, ${fail} failed`)
  await app.close()
  process.exit(fail === 0 ? 0 : 1)
}

async function assertRejects(fn, pattern, label) {
  try {
    await fn()
    chk(false, label, `${label} — it was accepted`)
  } catch (e) {
    chk(pattern.test(e?.message ?? ''), label, `${label} — rejected with the wrong error: ${e?.message}`)
  }
}

main().catch((e) => {
  console.error('\nthrew:', e?.message ?? e)
  console.error(e?.stack?.split('\n').slice(1, 6).join('\n'))
  process.exit(1)
})
