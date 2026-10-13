import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import {
  AI_CATEGORIES,
  FEATURE_CATEGORY,
  UNSUPPORTED_CATEGORIES,
  categoryOf,
  isSupportedCategory,
  rollUpByCategory,
} from './ai-categories'
import { COMMAND_USAGE_FEATURES, commandUsageFeature } from './ai-connected'

/**
 * §V2-11 — the eight tiles of frames `18:53`/`18:56`/`18:59`.
 *
 * THE ONE TEST THAT EARNS ITS PLACE is the first: it re-derives the feature
 * strings FROM THE SOURCE rather than from a list somebody keeps up to date by
 * hand. A feature added later and forgotten in the map breaks nothing visible —
 * its runs land nowhere and the totals still add up — so a convention would
 * never catch it. This does.
 */

/** Walk up to the workspace root: this compiles to CJS, so no `import.meta`. */
function workspaceRoot(from: string): string {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const up = dirname(dir)
    if (up === dir) throw new Error('workspace root not found')
    dir = up
  }
}
const SERVICE = join(workspaceRoot(process.cwd()), 'apps/api/src/modules/ai/ai.service.ts')

/**
 * Every literal handed to `complete(` or `recordUsage(` as its feature name —
 * and, where the command path files a turn by what it reached for
 * (`recordAs: … commandUsageFeature`, `ledger-rows/row-2294`), the names that
 * can come back from it. Only when the service really passes it: a list of
 * names nothing records would read as features that exist.
 */
function featuresInSource(): string[] {
  const src = readFileSync(SERVICE, 'utf8')
  const found = new Set<string>()
  for (const m of src.matchAll(/this\.complete\(\s*'([^']+)'/g)) found.add(m[1])
  for (const m of src.matchAll(/this\.recordUsage\(\s*\n?\s*'([^']+)'/g)) found.add(m[1])
  if (/recordAs:\s*\(\w+\)\s*=>\s*commandUsageFeature\(/.test(src)) for (const f of COMMAND_USAGE_FEATURES) found.add(f)
  return [...found].sort()
}

describe('§V2-11 AI action categories', () => {
  it('maps every feature the service actually records', () => {
    const inSource = featuresInSource()
    // Sanity: if the regex stops matching, an empty list would make every
    // assertion below vacuous — the classic check that cannot fail.
    assert.ok(inSource.length >= 20, `only found ${inSource.length} feature strings — the scan broke`)
    const missing = inSource.filter((f) => !(f in FEATURE_CATEGORY))
    assert.deepEqual(missing, [], `features with no category: ${missing.join(', ')}`)
  })

  it('has no mapping for a feature that no longer exists', () => {
    // The mirror of the above. A stale entry is harmless but it is also a lie
    // about what the product does, and it makes the map harder to trust.
    const inSource = new Set(featuresInSource())
    // `chat` is written by the streaming path's `recordUsage('chat', model, …)`,
    // which the scan does pick up; anything else unaccounted for is stale.
    const stale = Object.keys(FEATURE_CATEGORY).filter((f) => !inSource.has(f))
    assert.deepEqual(stale, [], `mapped features that nothing records: ${stale.join(', ')}`)
  })

  it('assigns each feature exactly one category, and every category is real', () => {
    for (const [feature, category] of Object.entries(FEATURE_CATEGORY)) {
      assert.ok(
        (AI_CATEGORIES as readonly string[]).includes(category),
        `${feature} is filed under "${category}", which is not one of the eight`,
      )
    }
  })

  it('marks none unsupported, now that every tile has a feature to count', () => {
    // If somebody wires up a feature and forgets to drop its tile from here, a
    // real count is hidden behind "not available" — the same defect in the
    // other direction. The two external tiles were the last (`ledger-rows/row-2294`).
    assert.deepEqual(Object.keys(UNSUPPORTED_CATEGORIES).sort(), [])
    for (const category of Object.keys(UNSUPPORTED_CATEGORIES)) {
      const contributors = Object.entries(FEATURE_CATEGORY).filter(([, c]) => c === category)
      assert.deepEqual(
        contributors,
        [],
        `${category} is marked unsupported but ${contributors.length} features feed it`,
      )
    }
    // And every SUPPORTED category has at least one feature, or it is a tile
    // that can only ever say zero without admitting it.
    for (const category of AI_CATEGORIES.filter(isSupportedCategory)) {
      assert.ok(
        Object.values(FEATURE_CATEGORY).includes(category),
        `${category} is offered as supported but nothing can contribute to it`,
      )
    }
  })

  it('returns all eight tiles whatever the data says', () => {
    const empty = rollUpByCategory({})
    assert.equal(empty.categories.length, 8)
    assert.deepEqual(empty.categories.map((c) => c.category), [...AI_CATEGORIES])
    assert.deepEqual(empty.unmapped, [])
    // Frame order, not insertion order: a grid that reorders itself with the
    // data cannot be measured.
    assert.equal(empty.categories[0].category, 'tasks')
    assert.equal(empty.categories[7].category, 'externalSearches')
  })

  it('adds a feature’s runs to its bucket and nowhere else', () => {
    const { categories } = rollUpByCategory({
      'task.generate': { calls: 3, costUsd: 0.3 },
      'command': { calls: 2, costUsd: 0.2 },
      'chat.title': { calls: 5, costUsd: 0.05 },
    })
    const by = Object.fromEntries(categories.map((c) => [c.category, c]))
    assert.equal(by.tasks.runs, 5, 'two task features should total five runs')
    assert.equal(by.comments.runs, 5)
    assert.equal(by.summaries.runs, 0)
    assert.equal(Math.round(by.tasks.costUsd * 100) / 100, 0.5)
    assert.deepEqual(by.tasks.features, ['command', 'task.generate'])
  })

  it('reports an unmapped feature instead of hiding it in a bucket', () => {
    const { categories, unmapped } = rollUpByCategory({
      'something.new': { calls: 4, costUsd: 1 },
    })
    assert.deepEqual(unmapped, ['something.new'])
    assert.equal(categories.reduce((n, c) => n + c.runs, 0), 0,
      'an unmapped feature was folded into a category, which hides the gap')
  })

  it('carries a reason on any it cannot fill, and none on the rest', () => {
    const { categories } = rollUpByCategory({})
    for (const c of categories) {
      if (c.supported) assert.equal(c.reasonKey, undefined)
      else assert.ok(c.reasonKey, `${c.category} is unsupported with no reason to show`)
    }
  })

  it('files a command turn by what it reached for, so the external tiles count only those', () => {
    assert.equal(commandUsageFeature([{ type: 'text' }]), 'command')
    assert.equal(commandUsageFeature([{ type: 'tool_use', name: 'create_task' }]), 'command')
    assert.equal(commandUsageFeature([{ type: 'tool_use', name: 'search_connected_apps' }]), 'command.connected_search')
    assert.equal(commandUsageFeature([{ type: 'tool_use', name: 'create_calendar_event' }]), 'command.connected_action')
    assert.equal(commandUsageFeature([{ type: 'tool_use', name: 'draft_email' }, { type: 'tool_use', name: 'search_connected_apps' }]), 'command.connected_action')
    assert.equal(categoryOf('command.connected_action'), 'externalActions')
    assert.equal(categoryOf('command.connected_search'), 'externalSearches')
  })

  it('does not invent a category for an unknown string', () => {
    assert.equal(categoryOf('nope'), null)
    assert.equal(categoryOf(''), null)
    // `toString` and friends are on Object.prototype; a bare lookup would
    // return a function here and `categoryOf` would answer with garbage.
    assert.equal(categoryOf('toString'), null)
  })
})
