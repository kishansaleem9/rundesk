import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AiService,
  formatAutomationBehavior,
  formatTeamWorkload,
  sanitizeAutomationSuggestions,
  deterministicAutomationSuggestions,
  type AutomationBehavior,
} from './ai.service'

/**
 * Unit coverage for the §7.7 AI automation-suggestion helpers and the §7.4
 * team-workload signal. The pure functions (behavior summary, workload string,
 * suggestion sanitizer, deterministic fallback) are tested directly; the
 * best-effort service path is tested with AI unavailable to lock in the
 * deterministic fallback (ANTHROPIC_API_KEY is unset in CI).
 */

const behavior: AutomationBehavior = {
  totalOpenTasks: 12,
  overdueCount: 3,
  statusTransitions: [
    { from: 'in_progress', to: 'done', count: 9 },
    { from: 'todo', to: 'in_progress', count: 4 },
  ],
  topAssignees: [{ name: 'Alice', count: 7 }],
  commentActivityCount: 5,
}

describe('formatAutomationBehavior (Plan §7.7)', () => {
  it('summarizes counts, transitions and assignees compactly', () => {
    const out = formatAutomationBehavior(behavior)
    assert.match(out, /Open tasks: 12/)
    assert.match(out, /Currently overdue tasks: 3/)
    assert.match(out, /in_progress -> done \(9x\)/)
    assert.match(out, /Alice \(7 open assignments\)/)
    assert.match(out, /Comment activity \(last 30 days\): 5/)
  })

  it('states the no-transitions case explicitly', () => {
    const out = formatAutomationBehavior({ ...behavior, statusTransitions: [] })
    assert.match(out, /No recorded status transitions/)
  })
})

describe('formatTeamWorkload (Plan §7.4)', () => {
  it('formats per-assignee open counts with singular/plural', () => {
    assert.equal(
      formatTeamWorkload([{ name: 'Alice', open: 8 }, { name: 'Bob', open: 1 }]),
      'Current assignee workload — Alice: 8 open tasks; Bob: 1 open task',
    )
  })
  it('returns empty string when there are no assignees', () => {
    assert.equal(formatTeamWorkload([]), '')
  })
})

describe('sanitizeAutomationSuggestions (Plan §7.7)', () => {
  it('keeps valid suggestions and coerces params to strings', () => {
    const out = sanitizeAutomationSuggestions([
      {
        name: 'Escalate',
        trigger: { type: 'task.overdue', filters: { projectId: 'p1' } },
        actions: [{ type: 'set_priority', params: { priority: 'urgent', keep: 3 } }],
        rationale: 'busy',
      },
    ])
    assert.equal(out.length, 1)
    assert.equal(out[0].trigger.type, 'task.overdue')
    assert.deepEqual(out[0].actions[0].params, { priority: 'urgent', keep: '3' })
  })

  it('drops unknown trigger/action types, action-less rules, and non-arrays', () => {
    assert.equal(sanitizeAutomationSuggestions('nope' as unknown).length, 0)
    assert.equal(
      sanitizeAutomationSuggestions([
        { trigger: { type: 'task.hacked' }, actions: [{ type: 'set_priority', params: {} }] },
        { trigger: { type: 'task.overdue' }, actions: [{ type: 'delete_everything', params: {} }] },
        { trigger: { type: 'task.overdue' }, actions: [] },
      ]).length,
      0,
    )
  })
})

describe('deterministicAutomationSuggestions (Plan §7.7 fallback)', () => {
  it('derives rules from behavior and returns 2-4 valid suggestions', () => {
    const out = deterministicAutomationSuggestions(behavior)
    assert.ok(out.length >= 2 && out.length <= 4)
    // Dominant transition -> notify on move to "done".
    assert.ok(out.some((s) => s.trigger.type === 'task.status_changed' && s.trigger.filters?.toStatus === 'done'))
    // Overdue pressure -> escalate to urgent.
    assert.ok(
      out.some((s) => s.trigger.type === 'task.overdue' && s.actions.some((a) => a.type === 'set_priority')),
    )
    // Everything it emits must survive the sanitizer (valid types).
    assert.equal(sanitizeAutomationSuggestions(out).length, out.length)
  })

  it('still returns >= 2 suggestions for a quiet/new workspace', () => {
    const out = deterministicAutomationSuggestions({
      totalOpenTasks: 0,
      overdueCount: 0,
      statusTransitions: [],
      topAssignees: [],
      commentActivityCount: 0,
    })
    assert.ok(out.length >= 2)
    assert.equal(sanitizeAutomationSuggestions(out).length, out.length)
  })
})

describe('AiService.suggestAutomations fallback (Plan §7.7, best-effort)', () => {
  it('returns the heuristic source when AI is not configured', async () => {
    // No ANTHROPIC_API_KEY -> client stays null -> isAvailable() false.
    const config: any = { get: () => undefined }
    const db: any = {
      // collectAutomationBehavior fires 5 read queries; every chain resolves [].
      select: () => {
        const c: any = {
          from: () => c,
          innerJoin: () => c,
          where: () => c,
          groupBy: () => c,
          orderBy: () => c,
          limit: () => c,
          then: (resolve: (v: any) => any) => Promise.resolve([]).then(resolve),
        }
        return c
      },
    }
    const svc = new AiService(config, db, {} as any)
    const result = await svc.suggestAutomations('ws1', { workspaceId: 'ws1' })
    assert.equal(result.source, 'heuristic')
    assert.ok(result.suggestions.length >= 2)
    assert.equal(sanitizeAutomationSuggestions(result.suggestions).length, result.suggestions.length)
  })
})
