import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AiService,
  computeWorkloadBalance,
  findOverloadedAssignees,
  mapAiWorkloadMoves,
  type WorkloadLoad,
} from './ai.service'

/**
 * Unit coverage for the §7.12 smart workload-balancing helpers and the execute
 * path. The pure functions (deterministic redistribution, overload detection,
 * model-move mapping) are tested directly; the execute path is tested against a
 * stub TasksService so the reassign reuse is verified without a database.
 */

const loads = (): WorkloadLoad[] => [
  { userId: 'a', name: 'Alice', open: 10, taskIds: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'] },
  { userId: 'b', name: 'Bob', open: 2, taskIds: ['b1', 'b2'] },
  { userId: 'c', name: 'Cara', open: 6, taskIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] },
]

describe('computeWorkloadBalance (§7.12 fallback)', () => {
  it('moves ~half the gap from the most-loaded to the least-loaded, drawing real ids', () => {
    const res = computeWorkloadBalance(loads(), { source: 'heuristic' })
    assert.equal(res.average, 6) // (10+2+6)/3
    assert.equal(res.source, 'heuristic')
    assert.equal(res.suggestions.length, 1)
    const s = res.suggestions[0]
    assert.equal(s.fromName, 'Alice')
    assert.equal(s.toName, 'Bob')
    assert.equal(s.count, 4) // floor((10-2)/2)
    assert.equal(s.taskIds.length, 4)
    assert.deepEqual(s.taskIds, ['t1', 't2', 't3', 't4'])
    assert.equal(s.source, 'heuristic')
  })

  it('suggests nothing when the team is balanced', () => {
    const balanced: WorkloadLoad[] = [
      { userId: 'a', name: 'A', open: 3, taskIds: ['1', '2', '3'] },
      { userId: 'b', name: 'B', open: 3, taskIds: ['4', '5', '6'] },
    ]
    assert.equal(computeWorkloadBalance(balanced).suggestions.length, 0)
  })
})

describe('findOverloadedAssignees (§7.12 alert selector)', () => {
  it('flags people ≥ absoluteMin AND ≥ average × factor', () => {
    const out = findOverloadedAssignees([
      { userId: 'a', name: 'Alice', open: 10 },
      { userId: 'b', name: 'Bob', open: 2 },
      { userId: 'c', name: 'Cara', open: 2 },
    ])
    assert.equal(out.length, 1)
    assert.equal(out[0].name, 'Alice')
    assert.equal(out[0].average, 4.7) // 14/3 rounded
  })

  it('returns none when balanced or below the absolute floor', () => {
    assert.deepEqual(
      findOverloadedAssignees([
        { userId: 'a', name: 'A', open: 3 },
        { userId: 'b', name: 'B', open: 3 },
      ]),
      [],
    )
    // A single person can never be "overloaded relative to the team".
    assert.deepEqual(findOverloadedAssignees([{ userId: 'a', name: 'A', open: 99 }]), [])
  })
})

describe('mapAiWorkloadMoves (§7.12 model → real ids)', () => {
  it('resolves task ids server-side and clamps counts to what the source has', () => {
    const res = mapAiWorkloadMoves(
      [
        { fromUserId: 'a', toUserId: 'b', count: 3, rationale: 'Alice is swamped' },
        { fromUserId: 'ghost', toUserId: 'b', count: 1 }, // unknown source → dropped
        { fromUserId: 'c', toUserId: 'c', count: 1 }, // self → dropped
      ],
      loads(),
    )
    assert.equal(res.source, 'ai')
    assert.equal(res.suggestions.length, 1)
    assert.deepEqual(res.suggestions[0].taskIds, ['t1', 't2', 't3'])
    assert.equal(res.suggestions[0].rationale, 'Alice is swamped')
  })

  it('is empty for non-array input', () => {
    assert.deepEqual(mapAiWorkloadMoves(undefined, loads()).suggestions, [])
  })
})

// A stub DB whose select() resolves the given membership rows (for memberRole).
function makeDbReturning(rows: any[]) {
  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => chain,
    then: (resolve: (v: any) => any, reject: (e: any) => any) => Promise.resolve(rows).then(resolve, reject),
  }
  return { select: () => chain } as any
}

describe('AiService.executeWorkloadBalance (§7.12 reassign via TasksService)', () => {
  it('reassigns each task: addAssignee(to) + removeAssignee(from), access-checked by the actor', async () => {
    const calls: Array<[string, string, string, string]> = []
    const tasks: any = {
      addAssignee: async (taskId: string, userId: string, actor: string) => calls.push(['add', taskId, userId, actor]),
      removeAssignee: async (taskId: string, userId: string, actor: string) =>
        calls.push(['remove', taskId, userId, actor]),
    }
    const svc = new AiService({ get: () => undefined } as any, makeDbReturning([{ role: 'member' }]), tasks)
    const res = await svc.executeWorkloadBalance(
      'w1',
      [{ fromUserId: 'a', toUserId: 'b', taskIds: ['t1', 't2'] }],
      'actor1',
    )
    assert.equal(res.reassigned, 2)
    assert.equal(res.skipped, 0)
    assert.deepEqual(calls, [
      ['add', 't1', 'b', 'actor1'],
      ['remove', 't1', 'a', 'actor1'],
      ['add', 't2', 'b', 'actor1'],
      ['remove', 't2', 'a', 'actor1'],
    ])
  })

  it('skips the whole move when the target is not a (non-guest) workspace member', async () => {
    const tasks: any = {
      addAssignee: async () => assert.fail('should not reassign to a non-member'),
      removeAssignee: async () => assert.fail('should not reassign to a non-member'),
    }
    const svc = new AiService({ get: () => undefined } as any, makeDbReturning([]), tasks) // memberRole → null
    const res = await svc.executeWorkloadBalance(
      'w1',
      [{ fromUserId: 'a', toUserId: 'ghost', taskIds: ['t1', 't2'] }],
      'actor1',
    )
    assert.equal(res.reassigned, 0)
    assert.equal(res.skipped, 2)
  })
})
