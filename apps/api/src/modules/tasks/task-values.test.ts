import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planLabelsByName, uniqueLabelNames } from './task-values'

/**
 * What a task's tags by name may be (`task-values.ts`), as `createTask` asks
 * them of the names it is handed.
 */

describe('tags by name — found-30-sep/refused-create-leaves-tags', () => {
  it('trims each name, drops a blank, keeps each once whatever its case, and gives one without a colour the neutral one', () => {
    assert.deepEqual(
      uniqueLabelNames([{ name: '  Design ' }, { name: 'design', color: '#ff0000' }, { name: '   ' }, { name: 'Later', color: '#00ff00' }]),
      [{ name: 'Design', color: '#94a3b8' }, { name: 'Later', color: '#00ff00' }],
    )
    assert.deepEqual(uniqueLabelNames(undefined), [])
  })

  it('finds a tag the workspace holds whatever its case, and would make the rest — none for a guest', () => {
    const wanted = [{ name: 'DESIGN', color: '#94a3b8' }, { name: 'Later', color: '#94a3b8' }]
    const existing = [{ id: 'label-design', name: 'design' }]
    assert.deepEqual(planLabelsByName(wanted, existing, { mayMake: true }), {
      foundIds: ['label-design'],
      toMake: [{ name: 'Later', color: '#94a3b8' }],
    })
    assert.deepEqual(planLabelsByName(wanted, existing, { mayMake: false }), { foundIds: ['label-design'], toMake: [] })
  })
})
