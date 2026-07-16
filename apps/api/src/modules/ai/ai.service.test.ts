import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatWorkspaceContext, formatTaskSummaryInput } from './ai.service'

/**
 * Unit tests for the AI context/summary-input ASSEMBLY functions (Plan §7.5/§7.6/§7.15).
 *
 * These are the pure string-assembly halves of `buildWorkspaceContext` and
 * `buildTaskSummaryInput`; the DB-read halves are exercised separately against
 * Postgres. Keeping the formatters pure means the grounding/token-bounding
 * behaviour is locked in without a database.
 */

describe('formatWorkspaceContext (Plan §7.6/§7.15)', () => {
  const base = {
    workspaceName: 'Acme',
    role: 'workspace_admin',
    counts: { spaces: 2, projects: 3, lists: 5, openTasks: 9 },
    spaces: [{ name: 'Engineering', projects: ['API', 'Web'] }],
    openTasks: [{ title: 'Fix login', dueDate: '2026-07-20T00:00:00Z', priority: 'high' }],
    history: [{ title: 'Ship v1', status: 'done', updatedAt: '2026-07-10T00:00:00Z' }],
  }

  it('includes role, structure counts+names, open tasks and 90-day history', () => {
    const out = formatWorkspaceContext(base)
    assert.match(out, /Workspace: Acme/)
    assert.match(out, /Your role: workspace_admin/)
    assert.match(out, /2 spaces, 3 projects, 5 lists, 9 open tasks/)
    assert.match(out, /Workspace structure:/)
    assert.match(out, /Engineering — projects: API, Web/)
    assert.match(out, /Your open assigned tasks:/)
    assert.match(out, /Fix login \(due 2026-07-20\) \[high\]/)
    assert.match(out, /Recent task history \(last 90 days/)
    assert.match(out, /Ship v1 \[done\] \(updated 2026-07-10\)/)
  })

  it('includes the currentView hint only when provided', () => {
    assert.doesNotMatch(formatWorkspaceContext(base), /Current view:/)
    assert.match(formatWorkspaceContext({ ...base, currentView: 'list Backlog' }), /Current view: list Backlog/)
  })

  it('states the no-open-tasks case explicitly', () => {
    const out = formatWorkspaceContext({ ...base, openTasks: [] })
    assert.match(out, /You have no open assigned tasks\./)
    assert.doesNotMatch(out, /Your open assigned tasks:/)
  })

  it('is token-bounded: caps spaces to 15, projects/space to 8 (+N more), history to 40', () => {
    const manySpaces = Array.from({ length: 30 }, (_v, i) => ({
      name: `S${i}`,
      projects: Array.from({ length: 20 }, (_p, j) => `P${i}-${j}`),
    }))
    const manyHistory = Array.from({ length: 100 }, (_v, i) => ({
      title: `H${i}`,
      status: 'done',
      updatedAt: null,
    }))
    const out = formatWorkspaceContext({ ...base, spaces: manySpaces, history: manyHistory })
    const structureLines = out.split('\n').filter((l) => l.startsWith('- S'))
    assert.equal(structureLines.length, 15, 'caps to 15 spaces')
    assert.match(out, /\+12 more/, 'shows overflow count for projects beyond 8')
    const historyLines = out.split('\n').filter((l) => /^- H\d+ \[done\]/.test(l))
    assert.equal(historyLines.length, 40, 'caps history to 40 rows')
  })

  it('omits due/updated parentheticals when dates are absent or invalid', () => {
    const out = formatWorkspaceContext({
      ...base,
      openTasks: [{ title: 'No due', dueDate: null, priority: 'low' }],
      history: [{ title: 'No date', status: 'todo', updatedAt: 'not-a-date' }],
    })
    assert.match(out, /- No due \[low\]/)
    assert.doesNotMatch(out, /No due \(due/)
    assert.match(out, /- No date \[todo\]$/m)
  })
})

describe('formatTaskSummaryInput (Plan §7.5)', () => {
  const base = {
    title: 'Ship summaries',
    description: 'Stream token by token',
    status: 'in_progress',
    priority: 'high',
    activity: [{ action: 'status_changed', actor: 'Alice' }],
    subtasks: [{ title: 'Route', status: 'todo' }],
    blockers: [{ title: 'Design frame', status: 'in_progress' }],
    comments: [{ author: 'Bob', body: 'Keep a fallback' }],
  }

  it('assembles title/status/priority/description plus enrichment sections', () => {
    const out = formatTaskSummaryInput(base)
    assert.match(out, /Task: Ship summaries/)
    assert.match(out, /Status: in_progress/)
    assert.match(out, /Priority: high/)
    assert.match(out, /Description:\nStream token by token/)
    assert.match(out, /Open subtasks \(1\):\n- Route \[todo\]/)
    assert.match(out, /Open blockers \(1\):\n- Design frame \[in_progress\]/)
    assert.match(out, /Recent comments:\n- Bob: Keep a fallback/)
    assert.match(out, /Recent activity:\n- Alice status changed/)
  })

  it('falls back to (no description) and drops empty enrichment sections', () => {
    const out = formatTaskSummaryInput({
      title: 'Bare',
      description: null,
      activity: [],
      subtasks: [],
      blockers: [],
      comments: [],
    })
    assert.match(out, /Description:\n\(no description\)/)
    assert.doesNotMatch(out, /Open subtasks/)
    assert.doesNotMatch(out, /Open blockers/)
    assert.doesNotMatch(out, /Recent comments/)
    assert.doesNotMatch(out, /Recent activity/)
  })

  it('is bounded: last 6 comments, first 8 activity, truncated comment bodies', () => {
    const longBody = 'x'.repeat(500)
    const out = formatTaskSummaryInput({
      ...base,
      comments: Array.from({ length: 10 }, (_v, i) => ({ author: `U${i}`, body: longBody })),
      activity: Array.from({ length: 20 }, (_v, i) => ({ action: 'updated', actor: `A${i}` })),
    })
    const commentLines = out.split('\n').filter((l) => /^- U\d+:/.test(l))
    assert.equal(commentLines.length, 6, 'keeps only the last 6 comments')
    assert.match(out, /- U4:/, 'last 6 means U4..U9')
    assert.ok(commentLines[0].length < 300, 'comment body is truncated')
    const activityLines = out.split('\n').filter((l) => /^- A\d+ updated/.test(l))
    assert.equal(activityLines.length, 8, 'keeps only the first 8 activity rows')
  })
})
