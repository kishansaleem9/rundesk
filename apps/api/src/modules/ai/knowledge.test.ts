import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getTableName } from 'drizzle-orm'
import { AiService } from './ai.service'
import { EmbeddingService } from './embedding.service'
import { embedText, DEFAULT_EMBED_DIM } from './embedding'
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

// A local (no-API-key) embedder — the deterministic default path. Shared by the
// vector-retrieval tests below so index-time and query-time vectors match dim.
const localEmbeddings = new EmbeddingService({ get: () => undefined } as any)
const D = DEFAULT_EMBED_DIM
/** Build a knowledge_embeddings row with a real, dim-D normalized vector. */
function embRow(
  sourceType: string,
  sourceId: string,
  title: string,
  url: string,
  text: string,
) {
  return { sourceType, sourceId, title, url, embedding: embedText(text, D), dim: D }
}

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

describe('AiService.answerKnowledge — vector retrieval + access scope (§15.1 deterministic path)', () => {
  it('ranks vector matches, drops an inaccessible private-space task, cites only accessible sources', async () => {
    // Three embedded sources. All are semantically close to the question, but
    // the access-filter task query resolves ONLY t1 (t2 lives in a private space
    // the caller cannot reach), so t2 must never be cited. t1 shares more of the
    // question's vocabulary than d1, so it ranks first.
    const db = makeDb({
      workspace_members: [{ role: 'member' }], // non-manager → visibility filter applies
      knowledge_embeddings: [
        embRow('task', 't1', 'Public roadmap', '/app/w1/pub?task=t1', 'roadmap launch plan ships q3'),
        embRow('task', 't2', 'Secret roadmap', '/app/w1/priv?task=t2', 'roadmap launch secret plan'),
        embRow('doc', 'd1', 'Launch plan', '/app/w1/docs?doc=d1', 'launch plan onboarding'),
      ],
      tasks: [{ id: 't1' }], // access query returns only the accessible task
      docs: [{ id: 'd1' }],
    })
    const svc = new AiService(noKeyConfig, db, {} as any, localEmbeddings)

    const res = await svc.answerKnowledge('w1', 'u-member', 'roadmap launch plan', {
      userId: 'u-member',
      workspaceId: 'w1',
    })

    assert.equal(res.source, 'vector') // no API key → deterministic over vector hits
    const ids = res.sources.map((s) => s.id)
    assert.deepEqual(ids, ['t1', 'd1'], 'only accessible sources, private task t2 excluded, closer item first')
    assert.ok(!res.sources.some((s) => s.id === 't2'), 'inaccessible private-space task is NOT surfaced')
    assert.deepEqual(res.sources[0], { type: 'task', id: 't1', title: 'Public roadmap', url: '/app/w1/pub?task=t1' })
    assert.match(res.answer, /Found 2 relevant items/)
  })

  it('returns a no-match answer (no sources) when the vector store is empty', async () => {
    const svc = new AiService(
      noKeyConfig,
      makeDb({ workspace_members: [{ role: 'member' }], knowledge_embeddings: [] }),
      {} as any,
      localEmbeddings,
    )
    const res = await svc.answerKnowledge('w1', 'u1', 'nothing here', { workspaceId: 'w1' })
    assert.equal(res.source, 'fallback')
    assert.deepEqual(res.sources, [])
    assert.match(res.answer, /No matching items/)
  })

  it('a workspace manager bypasses the visibility filter (all vector hits pass through)', async () => {
    // isWorkspaceManager → true, so filterAccessibleHits short-circuits and never
    // queries tasks; both survive. Question shares more with t1 so it ranks first.
    const db = makeDb({
      workspace_members: [{ role: 'workspace_admin' }],
      knowledge_embeddings: [
        embRow('task', 't1', 'A', '/a', 'alpha roadmap'),
        embRow('task', 't2', 'B', '/b', 'roadmap beta gamma'),
      ],
    })
    const svc = new AiService(noKeyConfig, db, {} as any, localEmbeddings)
    const res = await svc.answerKnowledge('w1', 'admin', 'roadmap alpha', { workspaceId: 'w1' })
    assert.deepEqual(res.sources.map((s) => s.id), ['t1', 't2'])
  })

  it('ranks a semantically-closer item above a farther one (cosine ordering)', async () => {
    const db = makeDb({
      workspace_members: [{ role: 'workspace_admin' }], // manager → skip access DB round-trip
      knowledge_embeddings: [
        embRow('task', 'far', 'Unrelated', '/far', 'accounting invoices payroll taxes'),
        embRow('task', 'near', 'On topic', '/near', 'mobile app launch marketing plan'),
      ],
    })
    const svc = new AiService(noKeyConfig, db, {} as any, localEmbeddings)
    const res = await svc.answerKnowledge('w1', 'admin', 'when is the mobile app launch', { workspaceId: 'w1' })
    const ids = res.sources.map((s) => s.id)
    assert.equal(ids[0], 'near', 'semantically-closer item ranks first')
    const farIdx = ids.indexOf('far')
    assert.ok(farIdx === -1 || farIdx > ids.indexOf('near'), 'the unrelated item never outranks the on-topic item')
  })

  it('surfaces an attachment hit whose parent task the caller can access (non-manager)', async () => {
    // The attachment inherits its task's container access: the access-filter
    // query (attachment -> task -> space/project) resolves a1, so it is cited.
    const db = makeDb({
      workspace_members: [{ role: 'member' }],
      knowledge_embeddings: [
        embRow('attachment', 'a1', 'launch-notes.txt', '/app/w1/pub?task=t1', 'roadmap launch plan ships q3'),
      ],
      task_attachments: [{ id: 'a1' }], // access query returns a1 => accessible
    })
    const svc = new AiService(noKeyConfig, db, {} as any, localEmbeddings)
    const res = await svc.answerKnowledge('w1', 'u-member', 'roadmap launch plan', {
      userId: 'u-member',
      workspaceId: 'w1',
    })
    assert.equal(res.source, 'vector')
    assert.deepEqual(res.sources.map((s) => s.id), ['a1'])
    assert.equal(res.sources[0].type, 'attachment')
    assert.equal(res.sources[0].title, 'launch-notes.txt')
  })

  it('drops an attachment whose parent task is in a private space the caller cannot reach', async () => {
    // The access-filter query returns nothing for a1 (its task is in a private
    // space the member is not part of), so the attachment must never be cited —
    // it must NOT leak through the generic pass-through.
    const db = makeDb({
      workspace_members: [{ role: 'member' }],
      knowledge_embeddings: [
        embRow('attachment', 'a1', 'secret.txt', '/app/w1/priv?task=t1', 'roadmap launch secret plan'),
      ],
      task_attachments: [], // access query returns nothing => inaccessible
    })
    const svc = new AiService(noKeyConfig, db, {} as any, localEmbeddings)
    const res = await svc.answerKnowledge('w1', 'u-member', 'roadmap launch plan', {
      userId: 'u-member',
      workspaceId: 'w1',
    })
    assert.deepEqual(res.sources, [], 'inaccessible attachment is not surfaced')
    assert.match(res.answer, /No matching items/)
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
