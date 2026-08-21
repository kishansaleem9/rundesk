import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  NotificationsService,
  PRIMARY_SELECTABLE_TYPES,
  DEFAULT_PRIMARY_TYPES,
} from './notifications.service'

/**
 * §2.2 — which notification types the Primary chip shows.
 *
 * > "Primary pe yeh setting ka option hai; is par main click karti hoon to yeh
 * >  mujh se poochta hai ke mujhe kya cheezein show karwani hain … Phir aap ko
 * >  Primary mein sirf wohi notifications show honge jo aap chahte hain."
 *
 * Primary was a hardcoded set of six types. That is a defensible default and
 * not what she asked for — she spent a minute on the customiser and named ten
 * kinds she would turn on or off.
 *
 * This lands in a jsonb column straight from the client, so the interesting
 * cases are the malformed ones. Two are genuinely ambiguous and worth pinning
 * rather than leaving to whoever edits this next:
 *
 *   []            — a real choice. "Show me nothing in Primary" is a thing a
 *                   person can mean, and silently replacing it with the default
 *                   would override them.
 *   ['nonsense']  — not a choice. Storing it would leave Primary permanently
 *                   empty with no way to tell from the UI why.
 */

/** Walk up to the workspace root: this compiles to CJS, so no import.meta. */
function workspaceRoot(from: string): string {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const up = dirname(dir)
    if (up === dir) throw new Error('workspace root not found')
    dir = up
  }
}

function fakeDb(saved?: unknown) {
  const writes: unknown[] = []
  const rows = [{ notificationPreferences: saved }]
  const thenable = () => ({
    from: () => thenable(),
    where: () => thenable(),
    limit: async () => rows,
    then: (res: (v: unknown) => void) => Promise.resolve(rows).then(res),
  })
  return {
    writes,
    db: {
      select: () => thenable(),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          writes.push(values.notificationPreferences)
          return {
            where: () => ({
              returning: async () => [{ notificationPreferences: values.notificationPreferences }],
            }),
          }
        },
      }),
    },
  }
}

const service = (saved?: unknown) => {
  const { db, writes } = fakeDb(saved)
  const config = { get: () => undefined } as never
  return {
    svc: new NotificationsService(db as never, {} as never, {} as never, config),
    writes,
  }
}

const primaryOf = (written: unknown) =>
  (written as { primaryTypes?: string[] } | undefined)?.primaryTypes

describe('Primary is what you chose (§2.2)', () => {
  it('stores the set a member picks', async () => {
    const { svc, writes } = service()
    await svc.updatePreferences('u1', { primaryTypes: ['task_mentioned', 'task_overdue'] })
    assert.deepEqual(primaryOf(writes[0]), ['task_mentioned', 'task_overdue'])
  })

  it('keeps an empty choice, because "nothing here" is a choice', async () => {
    const { svc, writes } = service()
    await svc.updatePreferences('u1', { primaryTypes: [] })
    assert.deepEqual(primaryOf(writes[0]), [])
  })

  it('drops types the customiser does not offer', async () => {
    const { svc, writes } = service()
    await svc.updatePreferences('u1', {
      primaryTypes: ['task_mentioned', 'not_a_type'],
    })
    assert.deepEqual(primaryOf(writes[0]), ['task_mentioned'])
  })

  it('falls back to the default when every value is junk', async () => {
    // Distinct from [] above: this is a malformed request, not a request for an
    // empty Primary, and storing it would leave the tab silently empty.
    const { svc, writes } = service()
    await svc.updatePreferences('u1', { primaryTypes: ['nonsense', 'also_nonsense'] })
    assert.deepEqual(primaryOf(writes[0]), DEFAULT_PRIMARY_TYPES)
  })

  it('de-duplicates', async () => {
    const { svc, writes } = service()
    await svc.updatePreferences('u1', {
      primaryTypes: ['chat_message', 'chat_message', 'chat_message'],
    })
    assert.deepEqual(primaryOf(writes[0]), ['chat_message'])
  })

  it('leaves an existing choice alone when the patch is about something else', async () => {
    // The profile page patches reminderLeadDays on its own; that must not reset
    // a Primary someone customised.
    const { svc, writes } = service({ primaryTypes: ['task_overdue'] })
    await svc.updatePreferences('u1', { reminderLeadDays: [1] })
    assert.deepEqual(primaryOf(writes[0]), ['task_overdue'])
  })

  it('defaults an account that has never opened the customiser', async () => {
    const { svc, writes } = service({})
    await svc.updatePreferences('u1', { reminderLeadDays: [1] })
    assert.deepEqual(primaryOf(writes[0]), DEFAULT_PRIMARY_TYPES)
  })

  it('offers every kind she named that the API can emit', () => {
    for (const type of DEFAULT_PRIMARY_TYPES) {
      assert.ok(
        (PRIMARY_SELECTABLE_TYPES as readonly string[]).includes(type),
        `${type} is a default but not selectable, so it could never be turned back on`,
      )
    }
  })

  describe('the kinds she named that had no type at all', () => {
    // The customiser can only offer what the API can emit, so five of the ten
    // kinds she went through were unofferable however good the picker was.
    const named = [
      'task_unassigned',
      'task_follower_changed',
      'message_reaction',
      'shared_with_me',
      'access_requested',
    ]

    it('are all selectable now', () => {
      for (const type of named) {
        assert.ok(
          (PRIMARY_SELECTABLE_TYPES as readonly string[]).includes(type),
          `${type} is not offered by the customiser`,
        )
      }
    })

    it('default to on for the three she asked to see', () => {
      // "kisi ne mera hi task kisi aur ko de diya aur mujhe REMOVE kar diya to
      // mujhe woh cheez show ho" / "FOLLOWER CHANGE" / "agar ACCESS REQUEST …
      // to mujhe show ho".
      for (const type of ['task_unassigned', 'task_follower_changed', 'access_requested']) {
        assert.ok(DEFAULT_PRIMARY_TYPES.includes(type), `${type} should start on`)
      }
    })

    it('default to off for the two she asked not to see', () => {
      // "Ab neeche se REACTIONS mujhe na show hon, [shared with] mujhe na show ho."
      for (const type of ['message_reaction', 'shared_with_me']) {
        assert.ok(!DEFAULT_PRIMARY_TYPES.includes(type), `${type} should start off`)
      }
    })

    it('can still be turned on, since off by default is not the same as absent', () => {
      const { svc } = service()
      return svc
        .updatePreferences('u1', { primaryTypes: ['message_reaction', 'shared_with_me'] })
        .then(() => assert.ok(true))
    })
  })
})

/**
 * §2.2 — the emitters, checked at the source.
 *
 * A type with no emitter is a checkbox that governs nothing, and an emitter
 * that cannot see who acted tells people about their own clicks. The second is
 * exactly what shipped first: `addWatcher` grew an `actorId` parameter and its
 * only caller did not pass one, so the "leave the actor out" filter never once
 * applied. Nothing failed — the notification simply went to the wrong set.
 *
 * TasksService needs ten collaborators to construct, so these read the source.
 * That is the weaker claim and is labelled as one rather than dressed up as
 * behaviour.
 */
describe('the emitters exist and know who acted (source-level, §2.2)', () => {
  const read = (rel: string) => readFileSync(join(workspaceRoot(process.cwd()), rel), 'utf8')
  const tasksService = read('apps/api/src/modules/tasks/tasks.service.ts')
  const tasksController = read('apps/api/src/modules/tasks/tasks.controller.ts')
  const chatService = read('apps/api/src/modules/chat/chat.service.ts')
  const sharesService = read('apps/api/src/modules/shares/shares.service.ts')
  const integrations = read(
    'apps/api/src/modules/integrations/connections/integration-connections.service.ts',
  )

  it('being taken off a task tells the person it happened to', () => {
    assert.match(tasksService, /type: 'task_unassigned'/)
    // …and not when you took yourself off.
    assert.match(tasksService, /userId !== actorId/)
  })

  it('a follower change tells the task, and the endpoint says who did it', () => {
    assert.match(tasksService, /type: 'task_follower_changed'/)
    assert.match(
      tasksController,
      /addWatcher\(taskId, body\.userId, user\.id\)/,
      'without the actor the exclusion below can never fire',
    )
    assert.match(tasksController, /removeWatcher\(taskId, userId, user\.id\)/)
    assert.match(tasksService, /recipients\.delete\(actorId\)/)
  })

  it('a reaction tells the author, and never for your own message', () => {
    assert.match(chatService, /type: 'message_reaction'/)
    assert.match(chatService, /message\.authorId !== userId/)
  })

  it('a share tells an existing member, not an invited address', () => {
    assert.match(sharesService, /type: 'shared_with_me'/)
    assert.match(sharesService, /userId && userId !== actor\.id/)
  })

  it('an access request tells the admins who can grant it', () => {
    assert.match(integrations, /type: 'access_requested'/)
    assert.match(integrations, /'workspace_admin', 'super_admin'/)
  })
})
