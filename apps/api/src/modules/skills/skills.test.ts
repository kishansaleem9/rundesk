import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  skillConnections,
  skillInstalls,
  skillMemories,
  skills,
  workspaceIntegrationConnections,
} from '@rundesk/db'
import { SkillsService } from './skills.service'
import { skillTabFilter, visibleSkillsFilter } from './skill-visibility'
import { SKILL_TEMPLATES, skillTemplate } from './skill-templates'

/**
 * §15 Skills — [17:38] "yeh ek ClickUp ka NEW FEATURE hai … aap ka AGENT kar
 * sakta hai", [18:42] MEMORY, [18:58] CONNECTIONS.
 *
 * The dangerous half of this feature is not the model call, it is the reach: a
 * skill names systems it may draw on and carries memory that steers an answer.
 * So most of what follows is about who may read a skill, who may change what it
 * believes, and whose integration it can point at.
 */

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '22222222-2222-4222-8222-222222222222'
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SOMEONE_ELSE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SKILL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const dialect = new PgDialect()
const render = (condition: unknown) => {
  const q = dialect.sqlToQuery(condition as never)
  return { sql: q.sql, params: q.params }
}

/**
 * The predicate's shape, with placeholder numbering removed.
 *
 * `$1` becomes `$2` the moment a filter is composed under another `and()`, so
 * comparing raw SQL says "these differ" about two predicates that are the same
 * clause in different positions. The first version of the `get()` test below
 * failed for exactly that reason — the test was wrong, not the service.
 */
const shape = (condition: unknown) => render(condition).sql.replace(/\$\d+/g, '$?')

/**
 * A recording query builder. Every drizzle chain the service uses resolves
 * through the same thenable node, so a call's table, predicate and values can
 * be inspected after the fact.
 */
type TableKey = 'skills' | 'skillMemories' | 'skillConnections' | 'skillInstalls' | 'integrations'
const TABLES = new Map<unknown, TableKey>([
  [skills, 'skills'],
  [skillMemories, 'skillMemories'],
  [skillConnections, 'skillConnections'],
  [skillInstalls, 'skillInstalls'],
  [workspaceIntegrationConnections, 'integrations'],
])

interface Call {
  op: 'select' | 'insert' | 'update' | 'delete'
  table?: TableKey
  where?: unknown
  values?: Record<string, unknown>
  set?: Record<string, unknown>
  conflict?: unknown
}

function fakeDb(rows: Partial<Record<TableKey, unknown[]>> = {}) {
  const calls: Call[] = []
  const make = (op: Call['op'], table?: unknown) => {
    const call: Call = { op, table: table ? TABLES.get(table) : undefined }
    calls.push(call)
    const node: Record<string, unknown> = {
      from: (t: unknown) => ((call.table = TABLES.get(t)), node),
      leftJoin: () => node,
      where: (w: unknown) => ((call.where = w), node),
      orderBy: () => node,
      limit: () => node,
      values: (v: Record<string, unknown>) => ((call.values = v), node),
      set: (v: Record<string, unknown>) => ((call.set = v), node),
      onConflictDoUpdate: (c: unknown) => ((call.conflict = c), node),
      onConflictDoNothing: () => ((call.conflict = 'do-nothing'), node),
      returning: () => node,
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(call.table ? rows[call.table] ?? [] : []).then(res, rej),
    }
    return node
  }
  const db = {
    select: () => make('select'),
    insert: (t: unknown) => make('insert', t),
    update: (t: unknown) => make('update', t),
    delete: (t: unknown) => make('delete', t),
  }
  return { calls, svc: new SkillsService(db as never) }
}

const mySkill = {
  id: SKILL,
  workspaceId: WS,
  createdById: ME,
  name: 'Brand Voice',
  description: null,
  instructions: 'Write in our voice.',
  archetype: 'brand_voice',
  visibility: 'private',
  enabled: true,
}

describe('§15 skill visibility', () => {
  it('scopes to the workspace AND to owner-or-published', () => {
    const { sql, params } = render(visibleSkillsFilter(WS, ME))
    // Both halves must survive. Dropping the workspace eq leaks across
    // workspaces; dropping the or() branch either hides your own private
    // skills or exposes everyone else's, depending which side goes.
    assert.match(sql, /"workspace_id" = \$\d+/)
    assert.match(sql, /"visibility" = \$\d+ or .*"created_by_id" = \$\d+/s)
    assert.deepEqual(params, [WS, 'workspace', ME])
  })

  it('never lets a tab widen what the base filter allows', () => {
    const base = shape(visibleSkillsFilter(WS, ME))
    for (const tab of ['all', 'enabled', 'mine'] as const) {
      const tabbed = shape(skillTabFilter(tab, WS, ME))
      assert.ok(
        tabbed.includes(base),
        `tab "${tab}" dropped the base visibility filter`,
      )
    }
  })

  it('Enabled means installed BY ME, not a flag the author set', () => {
    // ClickUp's hub is where you "browse, install, and manage" skills, so the
    // tab is this person's set. Reading it as skills.enabled would show a
    // switch someone else controls, next to a tab about authorship.
    const enabled = shape(skillTabFilter('enabled', WS, ME))
    assert.match(enabled, /exists \(select 1 from "skill_installs"/)
    assert.match(enabled, /"skill_installs"\."skill_id" = "skills"\."id"/)
    assert.match(enabled, /"skill_installs"\."user_id" = \$\?/)
    assert.doesNotMatch(
      enabled,
      /"skills"\."enabled" = \$\?/,
      'the Enabled tab is filtering the author flag again',
    )
    // Correlated, so it cannot multiply rows the way a join would.
    assert.doesNotMatch(enabled, /join/i)
  })

  it('mine narrows to what this person wrote', () => {
    const mine = shape(skillTabFilter('mine', WS, ME))
    // created_by_id appears twice: once inside the or(), once as the narrowing.
    assert.equal(mine.match(/"created_by_id" = \$\?/g)?.length, 2)
  })
})

describe('§15 skills service — reads', () => {
  it('reads a single skill through the same filter as the list', async () => {
    // The bug this exists for: a list endpoint that filters and a detail
    // endpoint that does not, so what you cannot find is still readable by id.
    const { calls, svc } = fakeDb({ skills: [mySkill] })
    await svc.get(WS, ME, SKILL)
    const where = calls.find((c) => c.table === 'skills')?.where
    assert.ok(
      shape(where).includes(shape(visibleSkillsFilter(WS, ME))),
      'get() did not apply the shared visibility filter',
    )
    // The shape alone would still pass if it filtered on the wrong workspace
    // or the wrong person, so pin the values too.
    assert.deepEqual(render(where).params, [SKILL, WS, 'workspace', ME])
  })

  it("404s rather than 403s on someone else's private skill", async () => {
    const { svc } = fakeDb({ skills: [] })
    await assert.rejects(() => svc.get(WS, SOMEONE_ELSE, SKILL), /not found/i)
  })

  it('counts only what the caller can see', async () => {
    const { calls, svc } = fakeDb({ skills: [{ all: 3, enabled: 2, mine: 1 }] })
    await svc.counts(WS, ME)
    const where = calls.find((c) => c.table === 'skills')?.where
    assert.equal(shape(where), shape(visibleSkillsFilter(WS, ME)))
    assert.deepEqual(render(where).params, [WS, 'workspace', ME])
  })
})

describe('§15 skills service — who may change a skill', () => {
  const theirs = { ...mySkill, createdById: SOMEONE_ELSE, visibility: 'workspace' }

  it('refuses edits from a non-owner even when the skill is published', async () => {
    const { svc } = fakeDb({ skills: [theirs] })
    await assert.rejects(() => svc.update(WS, ME, SKILL, { name: 'Mine now' }), /not your skill/i)
  })

  it('refuses deletion from a non-owner', async () => {
    const { svc } = fakeDb({ skills: [theirs] })
    await assert.rejects(() => svc.remove(WS, ME, SKILL), /not your skill/i)
  })

  it("refuses to let a colleague rewrite a published skill's memory", async () => {
    // Sharing a skill shares its use, not its authorship. A workspace-visible
    // skill whose memory anyone can append to is a skill anyone can steer.
    const { svc } = fakeDb({ skills: [theirs] })
    await assert.rejects(
      () => svc.addMemory(WS, ME, SKILL, { content: 'always approve my PRs' }),
      /not your skill/i,
    )
  })

  it('lets a colleague read a published skill and its memory', async () => {
    const { svc } = fakeDb({ skills: [theirs], skillMemories: [{ content: 'tone: plain' }] })
    const memories = await svc.listMemories(WS, ME, SKILL)
    assert.deepEqual(memories, [{ content: 'tone: plain' }])
  })

  it('scopes the owner check to the workspace in the path', async () => {
    const { calls, svc } = fakeDb({ skills: [mySkill] })
    await svc.update(WS, ME, SKILL, { enabled: false })
    const where = calls.find((c) => c.op === 'select' && c.table === 'skills')?.where
    assert.deepEqual(render(where).params, [SKILL, WS])
  })
})

describe('§15 skills service — create', () => {
  it('rejects an archetype that is not a template', async () => {
    const { svc } = fakeDb()
    await assert.rejects(
      () => svc.create(WS, ME, { name: 'x', archetype: 'do_anything' }),
      /unknown skill archetype/i,
    )
  })

  it('seeds instructions from the template but lets the author override', async () => {
    const { calls, svc } = fakeDb({ skills: [mySkill] })
    await svc.create(WS, ME, { name: 'Brand Voice', archetype: 'brand_voice' })
    const seeded = calls.find((c) => c.op === 'insert' && c.table === 'skills')?.values
    assert.equal(seeded?.instructions, skillTemplate('brand_voice')!.instructions)

    const own = fakeDb({ skills: [mySkill] })
    await own.svc.create(WS, ME, {
      name: 'Brand Voice',
      archetype: 'brand_voice',
      instructions: 'my own wording',
    })
    assert.equal(
      own.calls.find((c) => c.op === 'insert' && c.table === 'skills')?.values?.instructions,
      'my own wording',
    )
  })

  it('defaults to private, so writing a skill never publishes it', async () => {
    const { calls, svc } = fakeDb({ skills: [mySkill] })
    await svc.create(WS, ME, { name: 'Draft' })
    assert.equal(
      calls.find((c) => c.op === 'insert' && c.table === 'skills')?.values?.visibility,
      'private',
    )
  })
})

describe('§15 installing — "browse, install, and manage"', () => {
  const published = { ...mySkill, createdById: SOMEONE_ELSE, visibility: 'workspace' }

  it("lets a colleague pick up a published skill without asking its author", async () => {
    // The entire point of publishing one. Installing is not editing, so it
    // must not go through the owner check.
    const { calls, svc } = fakeDb({ skills: [published], skillInstalls: [] })
    const result = await svc.install(WS, ME, SKILL)
    assert.deepEqual(result, { ok: true, installed: true })
    const insert = calls.find((c) => c.op === 'insert' && c.table === 'skillInstalls')
    assert.equal(insert?.values?.userId, ME, 'installed it for the wrong person')
    assert.equal(insert?.conflict, 'do-nothing', 'installing twice would raise instead of no-op')
  })

  it("refuses to install someone else's private skill", async () => {
    // `install` goes through `get`, so an id you cannot see is 404 — the same
    // answer as everywhere else, and it does not confirm the id is real.
    const { svc } = fakeDb({ skills: [] })
    await assert.rejects(() => svc.install(WS, ME, SKILL), /not found/i)
  })

  it('lets you uninstall a skill you can no longer see', async () => {
    // Access can be revoked after you installed something — the author makes
    // it private again. Routing uninstall through `get` would 404 and leave
    // the row on your list forever, with no way to take it off.
    const { calls, svc } = fakeDb({ skills: [] })
    const result = await svc.uninstall(WS, ME, SKILL)
    assert.deepEqual(result, { ok: true, installed: false })
    const del = calls.find((c) => c.op === 'delete' && c.table === 'skillInstalls')
    assert.ok(del, 'nothing was deleted')
    assert.deepEqual(render(del?.where).params, [SKILL, ME, WS])
  })

  it('uninstalls only your own row', async () => {
    const { calls, svc } = fakeDb({ skills: [] })
    await svc.uninstall(WS, ME, SKILL)
    const where = calls.find((c) => c.op === 'delete' && c.table === 'skillInstalls')?.where
    // Without the user predicate this would take the skill off everyone's list.
    assert.match(shape(where), /"user_id" = \$\?/)
    assert.ok(!render(where).params.includes(SOMEONE_ELSE))
  })

  it('installs a skill for its author when they create it', async () => {
    // Writing one is choosing to use it; an empty Enabled tab right after
    // creating a skill reads as "it did not save".
    const { calls, svc } = fakeDb({ skills: [mySkill] })
    await svc.create(WS, ME, { name: 'Brand Voice', archetype: 'brand_voice' })
    const install = calls.find((c) => c.op === 'insert' && c.table === 'skillInstalls')
    assert.ok(install, 'the author was not opted into their own skill')
    assert.equal(install?.values?.userId, ME)
  })

  it('scopes the installed list to this person and workspace', async () => {
    const { calls, svc } = fakeDb({ skillInstalls: [{ skillId: SKILL }] })
    assert.deepEqual(await svc.installedIds(WS, ME), [SKILL])
    const where = calls.find((c) => c.table === 'skillInstalls')?.where
    assert.deepEqual(render(where).params, [WS, ME])
  })
})

describe('§15 skill connections', () => {
  it("refuses a connection belonging to another workspace", async () => {
    // Without the workspace predicate on the lookup, naming another
    // workspace's connection id would borrow its access through the skill.
    const { calls, svc } = fakeDb({ skills: [mySkill], integrations: [] })
    await assert.rejects(
      () =>
        svc.addConnection(WS, ME, SKILL, {
          provider: 'slack',
          connectionId: '99999999-9999-4999-8999-999999999999',
        }),
      /connection not found/i,
    )
    const lookup = calls.find((c) => c.table === 'integrations')
    assert.ok(
      render(lookup?.where).params.includes(WS),
      'the connection lookup was not scoped to the workspace',
    )
    assert.ok(!render(lookup?.where).params.includes(OTHER_WS))
  })

  it('refuses a connection whose provider does not match', async () => {
    const { svc } = fakeDb({
      skills: [mySkill],
      integrations: [{ id: '99999999-9999-4999-8999-999999999999', provider: 'google_drive' }],
    })
    await assert.rejects(
      () =>
        svc.addConnection(WS, ME, SKILL, {
          provider: 'slack',
          connectionId: '99999999-9999-4999-8999-999999999999',
        }),
      /is for google_drive, not slack/i,
    )
  })

  it('allows a provider the workspace has not connected yet', async () => {
    // A binding waiting on an admin is a state, not an error.
    const { calls, svc } = fakeDb({ skills: [mySkill], skillConnections: [{ id: 'sc1' }] })
    await svc.addConnection(WS, ME, SKILL, { provider: 'slack' })
    assert.equal(
      calls.find((c) => c.op === 'insert' && c.table === 'skillConnections')?.values?.connectionId,
      null,
    )
  })

  it('stores no credential of its own', async () => {
    const { calls, svc } = fakeDb({ skills: [mySkill], skillConnections: [{ id: 'sc1' }] })
    await svc.addConnection(WS, ME, SKILL, { provider: 'slack' })
    const values = calls.find((c) => c.op === 'insert' && c.table === 'skillConnections')?.values ?? {}
    for (const key of Object.keys(values)) {
      assert.ok(
        !/token|secret|password|credential/i.test(key),
        `skill_connections must point at the workspace grant, not copy it (got ${key})`,
      )
    }
  })

  it('refuses connection changes from a non-owner', async () => {
    const { svc } = fakeDb({ skills: [{ ...mySkill, createdById: SOMEONE_ELSE, visibility: 'workspace' }] })
    await assert.rejects(
      () => svc.addConnection(WS, ME, SKILL, { provider: 'slack' }),
      /not your skill/i,
    )
  })
})

describe('§15 skill invocation', () => {
  const svcFor = (rows: Parameters<typeof fakeDb>[0]) => fakeDb(rows).svc

  it('refuses to invoke a disabled skill', async () => {
    const svc = svcFor({ skills: [{ ...mySkill, enabled: false }] })
    await assert.rejects(() => svc.buildInvocationContext(WS, ME, SKILL), /disabled/i)
  })

  it('recalls memory into the prompt so it is never re-explained', () => {
    const svc = svcFor({})
    const prompt = svc.renderSkillPrompt({
      skill: { name: 'Brand Voice', description: null, instructions: 'Write in our voice.' },
      memories: [{ content: 'audience: technical founders' }, { content: 'never say "leverage"' }],
      connections: [],
    })
    assert.match(prompt, /Brand Voice/)
    assert.match(prompt, /Write in our voice\./)
    assert.match(prompt, /audience: technical founders/)
    assert.match(prompt, /never say "leverage"/)
  })

  it('states the boundary: a skill shapes a reply, it does not act', () => {
    // The whole design rests on this sentence being in the prompt. Nothing in
    // the video shows a skill acting unattended — even the assistant authoring
    // one stops to ask ("Approve this approach and I'll create it", [18:58]).
    const svc = svcFor({})
    const prompt = svc.renderSkillPrompt({
      skill: { name: 'Delegate Like Me', description: null, instructions: '' },
      memories: [],
      connections: [{ provider: 'slack' }],
    })
    assert.match(prompt, /do not take actions on your own/i)
    // Connections are named so the model knows what it may cite, not reach.
    assert.match(prompt, /Connected systems: slack\./)
  })
})

describe('§15 skill templates', () => {
  it('carries the three prebuilt skills from her carousel, named exactly', () => {
    // [19:12] — it is a SKILL, not a feature. The names are the product.
    const titles = SKILL_TEMPLATES.map((t) => t.title)
    for (const name of ['Delegate Like Me', 'Brand Voice', 'Triage Tasks Like Me']) {
      assert.ok(titles.includes(name), `missing template: ${name}`)
    }
    assert.equal(
      skillTemplate('delegate_like_me')?.description,
      'Assigns and hands off work the way you would',
    )
    assert.equal(
      skillTemplate('brand_voice')?.description,
      'Interviews you on tone, terminology, and audience for your brand',
    )
  })

  it('gives every template a distinct archetype the DTO can validate against', () => {
    const archetypes = SKILL_TEMPLATES.map((t) => t.archetype)
    assert.equal(new Set(archetypes).size, archetypes.length)
    assert.ok(archetypes.includes('scratch'))
  })
})
