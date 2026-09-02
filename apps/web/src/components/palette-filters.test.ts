import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * §A2.4 — "Clear filters" has to clear the filters it is counting.
 *
 * The Filters button carries a tally, `activeFilterCount`, and the panel has a
 * "Clear filters" button. They were maintained as two independent lists, and
 * they drifted: five controls — created-after, created-before, and the space,
 * folder and list pickers — counted toward the badge and were reset by
 * nothing.
 *
 * What that looks like to a person is worse than a missing feature. You narrow
 * a search to one Space, decide to start over, press Clear filters, and the
 * badge stays lit while the results stay narrowed. The control reports having
 * done something it did not do, and the only way out is to close the palette.
 *
 * Adding the five setters fixes today. This keeps them in step, by deriving
 * both lists from the source rather than restating either — a restated list is
 * the thing that drifted in the first place.
 */

const here = dirname(fileURLToPath(import.meta.url))
const PALETTE = join(here, 'command-palette.tsx')
const source = readFileSync(PALETTE, 'utf8')

/**
 * The state each counted filter is reset through.
 *
 * Almost every filter is `x` reset by `setX`. Two are not: the type filter is a
 * Set counted by `.size`, and `hasCustomField` is derived from two other
 * pieces of state, so clearing it means clearing both.
 */
const DERIVED: Record<string, string[]> = {
  typeFilter: ['setTypeFilter'],
  hasCustomField: ['setCustomFieldId', 'setCustomFieldValue'],
}

/** The identifiers `activeFilterCount` is built from, read off the source. */
function countedFilters(): string[] {
  const block = /const activeFilterCount =([\s\S]*?)\n\s*const hasFilter/.exec(source)?.[1] ?? ''
  assert.ok(block, 'could not find activeFilterCount — this guard is reading the wrong file')
  const names = new Set<string>()
  // `typeFilter.size +`, `(statusFilter ? 1 : 0)`, `(sortBy !== 'relevance' ...)`
  for (const m of block.matchAll(/([A-Za-z_$][\w$]*)(?:\.size|\s*(?:\?|!==))/g)) names.add(m[1])
  return [...names]
}

/**
 * The setters the "Clear filters" button calls.
 *
 * Anchored on the multi-statement body rather than on the word "Clear". There
 * is a second `setTypeFilter(new Set())` in this file — a one-liner that clears
 * only the type chips — and matching that one instead would have this guard
 * checking a button that was never meant to clear everything.
 */
function clearedBy(): Set<string> {
  const handler = /onClick=\{\(\) => \{(\s*setTypeFilter\(new Set\(\)\)[\s\S]*?)\n\s*\}\}/.exec(source)?.[1] ?? ''
  assert.ok(handler, 'could not find the clear-filters handler')
  assert.ok(
    handler.includes('setSortBy'),
    'the block found does not look like the clear-filters handler — it resets no sort',
  )
  return new Set([...handler.matchAll(/\b(set[A-Z][\w$]*)\s*\(/g)].map((m) => m[1]))
}

describe('§A2.4 the palette clears every filter it counts', () => {
  it('finds enough filters to be worth checking', () => {
    // A regex that quietly matched two things would make every assertion below
    // vacuous, which is the failure this whole file exists to prevent.
    const counted = countedFilters()
    assert.ok(
      counted.length >= 15,
      `only found ${counted.length} counted filters (${counted.join(', ')}) — the regex has drifted`,
    )
  })

  it('resets every filter that contributes to the badge', () => {
    const cleared = clearedBy()
    const missing: string[] = []
    for (const name of countedFilters()) {
      const setters = DERIVED[name] ?? [`set${name[0].toUpperCase()}${name.slice(1)}`]
      for (const setter of setters) {
        if (!cleared.has(setter)) missing.push(`${name} (needs ${setter})`)
      }
    }
    assert.deepEqual(
      missing,
      [],
      `Clear filters leaves these counted filters set, so the badge stays lit: ${missing.join(', ')}`,
    )
  })

  it('names only setters this component actually has', () => {
    // The other direction: a reset for a filter that no longer exists is dead
    // code that would make the check above pass for the wrong reason.
    for (const setter of clearedBy()) {
      assert.match(
        source,
        new RegExp(`const \\[[^\\]]+,\\s*${setter}\\s*\\]`),
        `the clear handler calls ${setter}, which is not state in this component`,
      )
    }
  })
})
