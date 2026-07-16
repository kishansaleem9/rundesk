import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getTableName } from 'drizzle-orm'
import { AiService } from './ai.service'
import {
  splitSearchId,
  hitToSource,
  assembleKnowledgeContext,
  deterministicKnowledgeAnswer,
  matchHelpTopics,
  formatHelpKnowledgeBase,
  helpTopicToSource,
  HELP_TOPICS,
  type RawSearchHit,
} from './knowledge'

/**
 * §15.1 Knowledge base + §14.4 Help center.
 *
 * The pure helpers (id parsing, context assembly, deterministic answer, help
 * keyword match) are tested directly. The retrieval/access-scope wiring is
 * tested with AI unavailable (ANTHROPIC_API_KEY unset in CI) against a mocked
 * SearchService + a table-keyed Drizzle mock, so we assert that (a) sources are
 * assembled from the accessible hits and (b) a hit the access-filter query does
 * NOT return (an inaccessible private-space task) is dropped. Real visibility
 * SQL is covered by the runtime Postgres check.
 */

// A Drizzle mock that yields rows keyed by the table passed to `.from(...)`,
// mirroring search.service.test.ts. Subquery chains (built for inArray) are
// never awaited, so their rows are irrelevant.
function makeDb(tableRows: Record<string, unknown[]>) {
  const chain = (): any => {
    let rows: unknown[] = []
    const c: any = {
      from: (t: unknown) => {
        rows = tableRows[getTableName(t as never)] ?? []
        return c
      },
      where: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      orderBy: () => c,
      limit: () => c,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    }
    return c
  }
  return { select: () => chain() } as any
}

const noKeyConfig: any = { get: () => undefined } // → isAvailable() === false

describe('splitSearchId / hitToSource (§15.1)', () => {
  it('splits a prefixed id into entity type + raw id', () => {
    assert.deepEqual(splitSearchId('task-abc-123'), { type: 'task', rawId: 'abc-123' })
    assert.deepEqual(splitSearchId('doc-d1'), { type: 'doc', rawId: 'd1' })
    assert.deepEqual(splitSearchId('nodash'), { type: 'nodash', rawId: 'nodash' })
  })
  it('maps a hit to the cited-source shape (prefix stripped)', () => {
    const s = hitToSource({ id: 'task-t1', entityType: 'task', title: 'Fix login', content: 'x', url: '/u' })
    assert.deepEqual(s, { type: 'task', id: 't1', title: 'Fix login', url: '/u' })
  })
})

describe('assembleKnowledgeContext (§15.1)', () => {
  it('numbers items as [n] citations with a trimmed snippet + type label', () => {
    const out = assembleKnowledgeContext([
      { id: 'task-t1', entityType: 'task', title: 'Launch plan', content: '  spread   out  ', url: '/a' },
      { id: 'doc-d1', entityType: 'doc', title: 'Spec', content: 'y'.repeat(500), url: '/b' },
    ])
    assert.match(out, /\[1\] \(task\) Launch plan\nspread out/)
    assert.match(out, /\[2\] \(doc\) Spec/)
    const snippet = out.split('\n').find((l) => l.startsWith('y')) ?? ''
    assert.ok(snippet.length <= 240, 'snippet trimmed to 240 chars')
  })
  it('caps to 8 items', () => {
    const hits: RawSearchHit[] = Array.from({ length: 12 }, (_v, i) => ({
      id: `task-t${i}`, entityType: 'task', title: `T${i}`, content: '', url: '/x',
    }))
    assert.equal((assembleKnowledgeContext(hits).match(/\[\d+\]/g) ?? []).length, 8)
  })
})

describe('deterministicKnowledgeAnswer (§15.1 fallback — no fabrication)', () => {
  it('reports the match count and points at the sources', () => {
    const out = deterministicKnowledgeAnswer('when is launch', [
      { type: 'task', id: 't1', title: 'Launch', url: '/a' },
      { type: 'doc', id: 'd1', title: 'Plan', url: '/b' },
    ])
    assert.match(out, /Found 2 relevant items/)
    assert.match(out, /content you can access/)
    assert.match(out, /launch/)
  })
  it('states the no-match case plainly', () => {
    assert.match(deterministicKnowledgeAnswer('x', []), /No matching items/)
  })
})

describe('AiService.answerKnowledge — assembles sources + honors access scope (§15.1 deterministic path)', () => {
  it('drops an inaccessible private-space task and cites only accessible sources', async () => {
    // Search returns two tasks + a doc. The access-filter task query resolves
    // ONLY t1 (t2 lives in a private space the caller cannot reach), so t2 must
    // not appear in the cited sources.
    const hits: RawSearchHit[] = [
      { id: 'task-t1', entityType: 'task', title: 'Public roadmap', content: 'ships in Q3', url: '/app/w1/pub?task=t1' },
      { id: 'task-t2', entityType: 'task', title: 'Secret roadmap', content: 'private plan', url: '/app/w1/priv?task=t2' },
      { id: 'doc-d1', entityType: 'doc', title: 'Onboarding', content: 'welcome', url: '/app/w1/docs?doc=d1' },
    ]
    const search: any = { search: async () => hits }
    const db = makeDb({
      workspace_members: [{ role: 'member' }], // non-manager → visibility filter applies
      tasks: [{ id: 't1' }], // access query returns only the accessible task
      docs: [{ id: 'd1' }],
    })
    const svc = new AiService(noKeyConfig, db, {} as any, search)

    const res = await svc.answerKnowledge('w1', 'u-member', 'what is on the roadmap', {
      userId: 'u-member',
      workspaceId: 'w1',
    })

    assert.equal(res.source, 'search') // no API key → deterministic
    const ids = res.sources.map((s) => s.id)
    assert.deepEqual(ids, ['t1', 'd1'], 'only accessible sources, private task t2 excluded')
    assert.ok(!res.sources.some((s) => s.id === 't2'), 'inaccessible private-space task is NOT surfaced')
    assert.deepEqual(res.sources[0], { type: 'task', id: 't1', title: 'Public roadmap', url: '/app/w1/pub?task=t1' })
    assert.match(res.answer, /Found 2 relevant items/)
  })

  it('returns a no-match answer (no sources) when retrieval finds nothing', async () => {
    const search: any = { search: async () => [] }
    const svc = new AiService(noKeyConfig, makeDb({ workspace_members: [{ role: 'member' }] }), {} as any, search)
    const res = await svc.answerKnowledge('w1', 'u1', 'nothing here', { workspaceId: 'w1' })
    assert.equal(res.source, 'search')
    assert.deepEqual(res.sources, [])
    assert.match(res.answer, /No matching items/)
  })

  it('a workspace manager bypasses the visibility filter (all hits pass through)', async () => {
    const hits: RawSearchHit[] = [
      { id: 'task-t1', entityType: 'task', title: 'A', content: '', url: '/a' },
      { id: 'task-t2', entityType: 'task', title: 'B', content: '', url: '/b' },
    ]
    const search: any = { search: async () => hits }
    // isWorkspaceManager → true, so filterAccessibleHits short-circuits and never
    // queries tasks; both survive.
    const svc = new AiService(noKeyConfig, makeDb({ workspace_members: [{ role: 'workspace_admin' }] }), {} as any, search)
    const res = await svc.answerKnowledge('w1', 'admin', 'q', { workspaceId: 'w1' })
    assert.deepEqual(res.sources.map((s) => s.id), ['t1', 't2'])
  })
})

describe('matchHelpTopics (§14.4 keyword fallback — closest FAQ)', () => {
  it('returns the invite topic first for an invite question', () => {
    const out = matchHelpTopics('How do I invite members to my workspace?')
    assert.ok(out.length > 0)
    assert.equal(out[0].id, 'invite-members')
    assert.ok(out[0].score > 0)
  })
  it('returns the shortcuts topic for a keyboard question', () => {
    assert.equal(matchHelpTopics('what keyboard shortcuts exist')[0].id, 'shortcuts')
  })
  it('returns the time-tracking topic for a time question', () => {
    assert.equal(matchHelpTopics('how do I log billable hours on a task')[0].id, 'time-tracking')
  })
  it('returns nothing for an all-stopword / unrelated question', () => {
    assert.deepEqual(matchHelpTopics('the a an of'), [])
  })
})

describe('AiService.answerHelp — deterministic FAQ fallback (§14.4)', () => {
  it('answers with the closest FAQ topic and cites relevant entries when AI is unavailable', async () => {
    const svc = new AiService(noKeyConfig, {} as any, {} as any) // help touches neither db nor search
    const res = await svc.answerHelp('How can I invite teammates?', {})
    assert.equal(res.source, 'faq')
    assert.equal(res.sources[0].id, 'invite-members')
    assert.equal(res.sources[0].type, 'faq')
    assert.match(res.sources[0].url, /help#help-invite-members/)
    const invite = HELP_TOPICS.find((t) => t.id === 'invite-members')!
    assert.equal(res.answer, invite.answer)
  })
  it('falls back to top topics (no fabrication) when nothing matches', async () => {
    const svc = new AiService(noKeyConfig, {} as any, {} as any)
    const res = await svc.answerHelp('qwerty zxcvb', {})
    assert.equal(res.source, 'faq')
    assert.ok(res.sources.length > 0, 'still offers topics to explore')
    assert.match(res.answer, /couldn't find|contact support/i)
  })
})

describe('formatHelpKnowledgeBase / helpTopicToSource (§14.4)', () => {
  it('renders every topic as a Q/A pair for grounding', () => {
    const kb = formatHelpKnowledgeBase()
    assert.equal((kb.match(/^Q: /gm) ?? []).length, HELP_TOPICS.length)
  })
  it('deep-links a topic to its on-page FAQ anchor', () => {
    assert.deepEqual(helpTopicToSource(HELP_TOPICS[0]), {
      type: 'faq',
      id: HELP_TOPICS[0].id,
      title: HELP_TOPICS[0].question,
      url: `/app/help#help-${HELP_TOPICS[0].id}`,
    })
  })
})
