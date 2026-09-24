import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AiService,
  projectKeywords,
  projectSimilarity,
  rankSimilarProjects,
  deterministicTaskSuggestions,
  sanitizeTaskSuggestions,
  summarizeSuggestionBasis,
  type SimilarProject,
} from './ai.service'

/**
 * Unit coverage for the §7.10 smart task-suggestion helpers. The pure functions
 * (keyword extraction, similarity, ranking, deterministic fallback, sanitizer,
 * basis line) are tested directly; the best-effort service path is exercised
 * with AI unavailable (ANTHROPIC_API_KEY is unset in CI) to lock in the
 * most-frequent-titles fallback.
 */

describe('projectKeywords / projectSimilarity (§7.10)', () => {
  it('drops stopwords and short tokens', () => {
    const kw = projectKeywords('The New Mobile App Redesign')
    assert.ok(kw.has('mobile'))
    assert.ok(kw.has('redesign'))
    assert.ok(!kw.has('the'))
    assert.ok(!kw.has('app')) // stopword
    assert.ok(!kw.has('new')) // stopword
  })

  it('scores keyword overlap with a containment bonus', () => {
    // {mobile,redesign} vs {mobile,launch}: shared 1 / union 3 ≈ 0.33
    assert.ok(Math.abs(projectSimilarity('Mobile App Redesign', 'Mobile App Launch') - 1 / 3) < 1e-9)
    // containment bonus pushes a subset name higher
    assert.ok(projectSimilarity('Website', 'Website Revamp') > 0.6)
    // no shared keywords → 0
    assert.equal(projectSimilarity('Payroll', 'Garden Party'), 0)
  })
})

describe('rankSimilarProjects (§7.10)', () => {
  const candidates = [
    { id: '1', name: 'Marketing Website', taskTitles: ['a'] },
    { id: '2', name: 'Payroll System', taskTitles: ['b'] },
    { id: '3', name: 'Marketing Campaign Q3', taskTitles: ['c'] },
  ]
  it('ranks by similarity, keeping only projects with signal', () => {
    const ranked = rankSimilarProjects('Marketing Launch', candidates)
    assert.equal(ranked[0].name.startsWith('Marketing'), true)
    // Payroll shares no keywords → excluded when there is signal elsewhere.
    assert.ok(!ranked.some((r) => r.name === 'Payroll System'))
  })
  it('falls back to the most recent few when nothing matches', () => {
    const ranked = rankSimilarProjects('Zzz Unrelated', candidates, 2)
    assert.equal(ranked.length, 2)
  })
})

describe('deterministicTaskSuggestions (§7.10 fallback)', () => {
  it('returns the most-frequent titles, counting a title once per project', () => {
    const similar: SimilarProject[] = [
      { id: '1', name: 'A', score: 0.5, taskTitles: ['Design mockups', 'Set up repo', 'Design mockups'] },
      { id: '2', name: 'B', score: 0.4, taskTitles: ['design MOCKUPS', 'Write tests'] },
    ]
    const out = deterministicTaskSuggestions(similar)
    // "Design mockups" appears in both projects (case-insensitive) → first.
    assert.equal(out[0].title, 'Design mockups')
    const titles = out.map((s) => s.title)
    assert.deepEqual(titles, ['Design mockups', 'Set up repo', 'Write tests'])
  })
  it('is empty when no similar project has tasks', () => {
    assert.deepEqual(deterministicTaskSuggestions([{ id: '1', name: 'A', score: 0, taskTitles: [] }]), [])
  })
})

describe('sanitizeTaskSuggestions (§7.10)', () => {
  it('accepts strings/objects, strips numbering, validates priority, de-dupes', () => {
    const out = sanitizeTaskSuggestions([
      '1. Set up CI',
      { title: 'Set up CI' }, // dup by normalized title
      { title: 'Ship it', priority: 'high' },
      { title: 'Bad prio', priority: 'wat' },
      { title: '' },
      42,
    ])
    assert.deepEqual(out, [
      { title: 'Set up CI' },
      { title: 'Ship it', priority: 'high' },
      { title: 'Bad prio' },
    ])
  })
  it('returns [] for non-arrays', () => {
    assert.deepEqual(sanitizeTaskSuggestions('nope' as unknown), [])
  })
})

describe('summarizeSuggestionBasis (§7.10)', () => {
  it('names the projects it learned from', () => {
    const basis = summarizeSuggestionBasis([
      { id: '1', name: 'Alpha', score: 0.5, taskTitles: ['x'] },
      { id: '2', name: 'Beta', score: 0.4, taskTitles: ['y'] },
    ])
    assert.match(basis, /Learned from 2 similar projects: Alpha, Beta/)
  })
  it('states the empty case', () => {
    assert.match(summarizeSuggestionBasis([]), /No similar projects with tasks yet/)
  })
})

describe('AiService.suggestTasks fallback (§7.10, best-effort)', () => {
  it('returns the heuristic source (most-frequent titles) when AI is not configured', async () => {
    const config: any = { get: () => undefined } // no ANTHROPIC_API_KEY → isAvailable() false
    // collectCandidateProjects fires 2 selects: project rows, then task rows.
    // "Draft copy" appears in BOTH similar projects → most frequent (a title is
    // counted at most once per project).
    const results: any[][] = [
      [
        { id: 'p2', name: 'Marketing Website' },
        { id: 'p3', name: 'Marketing Campaign' },
      ],
      [
        { projectId: 'p2', title: 'Draft copy' },
        { projectId: 'p2', title: 'Design hero' },
        { projectId: 'p3', title: 'Draft copy' },
        { projectId: 'p3', title: 'Set schedule' },
      ],
    ]
    let i = 0
    const chain = (rows: any[]): any => {
      const c: any = {
        from: () => c,
        innerJoin: () => c,
        where: () => c,
        orderBy: () => c,
        limit: () => c,
        then: (resolve: (v: any) => any, reject: (e: any) => any) => Promise.resolve(rows).then(resolve, reject),
      }
      return c
    }
    const db: any = { select: () => chain(results[i++] ?? []) }
    const svc = new AiService(config, db, {} as any)
    // A reader who may open everything, so the read rule adds no query to the
    // two this fake answers in order; who may read what is `ai-read-access`'s.
    const res = await svc.suggestTasks({ workspaceId: 'w1', projectName: 'Marketing Launch' }, { workspaceId: 'w1' }, { id: 'u1', role: 'super_admin' })
    assert.equal(res.source, 'heuristic')
    assert.ok(res.suggestions.length >= 1)
    assert.equal(res.suggestions[0].title, 'Draft copy') // most frequent
    assert.match(res.basis, /Marketing Website/)
  })
})
