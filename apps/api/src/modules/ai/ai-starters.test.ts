import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  STARTER_CARD_COUNT,
  contextualCardCount,
  isStarterSurface,
  overdueBefore,
  starterCards,
  type StarterFacts,
} from './ai-starters'

/**
 * §V2-S17/S22 frames `16:32` and `21:15` — the starter cards CHANGE.
 *
 * What is checkable without a database is the only thing that actually matters
 * about this row: that two different sets of facts produce two different sets
 * of cards, and that the difference is attributable. The numbers themselves are
 * read from Postgres and asserted in `test/e2e/ai-starters` coverage inside
 * `ai-assign.mjs`'s sibling checks; here the question is whether the selection
 * can move at all.
 *
 * The previous implementation was `SUGGESTED_PROMPT_KEYS`, five `const` strings
 * rendered on every surface for every person for ever. There is no test that
 * could have failed on it, because there was no input.
 */

const base: StarterFacts = { surface: 'workspace', overdue: 0, assignedOpen: 0, workspaceOpen: 0 }

describe('§V2-S22 `21:15` — the cards are chosen, not listed', () => {
  it('always returns exactly four, as both frames draw four', () => {
    // An empty starter row is the one state neither frame shows, so a brand new
    // workspace with nothing in it still has to reach four.
    assert.equal(starterCards(base).length, STARTER_CARD_COUNT)
    assert.equal(starterCards({ ...base, overdue: 9, assignedOpen: 9, workspaceOpen: 9 }).length, 4)
  })

  it('offers "Find Blockers" when there ARE blockers, and not when there are none', () => {
    /*
     * `21:15` draws **Find Blockers — Search overdue tasks**. A card that
     * promises to find overdue work on a clean board finds nothing, and one
     * that never appears at all is the fixed list this row exists to replace.
     * So both directions are asserted; asserting only the first passes on a
     * card that is simply always there.
     */
    const clean = starterCards(base).map((c) => c.id)
    const late = starterCards({ ...base, overdue: 3 }).map((c) => c.id)
    assert.ok(!clean.includes('findBlockers'), `a clean board offered ${clean.join(', ')}`)
    assert.ok(late.includes('findBlockers'), `three overdue tasks offered ${late.join(', ')}`)
  })

  it('names the fact AND the number that put each card there', () => {
    // The anti-facade field. Without it "the set changed" is two lists of ids,
    // which is also what a set rotating on a timer would look like.
    const cards = starterCards({ ...base, overdue: 3, assignedOpen: 7, workspaceOpen: 12 })
    const by = new Map(cards.map((c) => [c.id, c.because]))
    assert.equal(by.get('findBlockers'), 'overdue:3')
    assert.equal(by.get('dailyPlan'), 'assigned:7')
    assert.equal(by.get('taskSummary'), 'open:12')
  })

  it('the surface changes the set too', () => {
    const workspace = starterCards(base).map((c) => c.id)
    const list = starterCards({ ...base, surface: 'list' }).map((c) => c.id)
    assert.notDeepEqual(workspace, list)
    assert.ok(!workspace.includes('listSummary'), `the workspace surface offered ${workspace.join(', ')}`)
    assert.equal(list[0], 'listSummary')
  })

  it('is deterministic — the same facts give the same four in the same order', () => {
    // A row of buttons that reshuffled between renders would be unusable, and
    // it would also make "the set changed" useless as evidence of anything.
    const facts = { ...base, overdue: 1, workspaceOpen: 4 }
    assert.deepEqual(starterCards(facts), starterCards(facts))
  })

  it('counts how many of the four context actually chose', () => {
    /*
     * Four floor cards is a real state and the surface has to be able to tell
     * it apart from four contextual ones. Implying otherwise — drawing the same
     * four and calling them contextual — is the whole defect class.
     */
    assert.equal(contextualCardCount(starterCards(base)), 0)
    assert.equal(contextualCardCount(starterCards({ ...base, overdue: 2, workspaceOpen: 5 })), 2)
  })

  it('every card carries three distinct keys, so none renders blank', () => {
    for (const card of starterCards({ ...base, surface: 'list', overdue: 1, assignedOpen: 1, workspaceOpen: 1 })) {
      assert.ok(card.titleKey.startsWith('aiStarters.'), `${card.id} title key is ${card.titleKey}`)
      assert.ok(card.subtitleKey.startsWith('aiStarters.'), `${card.id} subtitle key is ${card.subtitleKey}`)
      assert.ok(card.promptKey.startsWith('aiStarters.'), `${card.id} prompt key is ${card.promptKey}`)
      assert.notEqual(card.titleKey, card.subtitleKey)
      assert.notEqual(card.subtitleKey, card.promptKey)
    }
  })

  it('no card id repeats within a set', () => {
    const ids = starterCards({ ...base, overdue: 5, assignedOpen: 5, workspaceOpen: 5 }).map((c) => c.id)
    assert.equal(new Set(ids).size, ids.length, `duplicates in ${ids.join(', ')}`)
  })

  it('"overdue" starts at midnight, not at the current instant', () => {
    /*
     * A due date is a DAY in this product. Comparing it to `new Date()` reports
     * a task due TODAY as overdue from one minute past midnight — so the
     * starter cards would offer "Find Blockers" all day about work that is not
     * late, and the assignee reason would count the same tasks against
     * somebody. Both readers use this one boundary.
     */
    const at = new Date('2026-09-21T14:32:11.500Z')
    const boundary = overdueBefore(at)
    assert.equal(boundary.getHours(), 0)
    assert.equal(boundary.getMinutes(), 0)
    assert.equal(boundary.getSeconds(), 0)
    assert.equal(boundary.getMilliseconds(), 0)
    assert.equal(boundary.getDate(), at.getDate())
    // And it does not mutate what it was handed.
    assert.equal(at.toISOString(), '2026-09-21T14:32:11.500Z')
  })

  it('an unknown surface is not a surface', () => {
    assert.equal(isStarterSurface('list'), true)
    assert.equal(isStarterSurface('workspace'), true)
    assert.equal(isStarterSurface('dashboard'), false)
    // `task` was drafted and dropped while nothing could send it; the dock
    // pointed at a task by Brain² sends it now.
    assert.equal(isStarterSurface('task'), true)
    assert.equal(isStarterSurface(undefined), false)
  })

  it('a dock pointed at a task offers the task\'s three first, and the fourth by the facts', () => {
    const cards = starterCards({ surface: 'task', overdue: 2, assignedOpen: 5, workspaceOpen: 9 })
    assert.deepEqual(cards.map((c) => c.id), ['thisTask', 'taskProgress', 'similarTasks', 'findBlockers'])
    assert.deepEqual(cards.slice(0, 3).map((c) => c.because), ['surface:task', 'surface:task', 'surface:task'])
    // And never on another surface.
    for (const surface of ['workspace', 'list'] as const) {
      const ids = starterCards({ surface, overdue: 2, assignedOpen: 5, workspaceOpen: 9 }).map((c) => c.id)
      assert.equal(ids.some((id) => ['thisTask', 'taskProgress', 'similarTasks'].includes(id)), false, surface)
    }
  })
})
