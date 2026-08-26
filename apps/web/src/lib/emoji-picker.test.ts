import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_FREQUENT,
  EMOJI_CATEGORIES,
  FREQUENT_SHOWN,
  applySkinTone,
  bumpFrequent,
  loadEmojiCatalog,
  parseCategory,
  rankFrequent,
  scoreEmoji,
  searchEmoji,
  stripSkinTone,
  type EmojiEntry,
} from './emoji-picker'

/**
 * §2.8 gap 7 — the picker's judgement calls.
 *
 * Every one of these fails silently in the UI: a skin tone applied in the wrong
 * place renders as two loose characters, a search that ranks badly looks like a
 * search that found nothing, and a Frequently Used row that forgets is just a
 * row of defaults forever.
 */

describe('§2.8 skin tone goes where the person is', () => {
  it('follows the character it colours', () => {
    assert.equal(applySkinTone('👍', '\u{1F3FD}'), '👍\u{1F3FD}')
  })

  it('replaces the presentation selector rather than sitting after it', () => {
    // ⛹️‍♀️ is BALL + FE0F + ZWJ + FEMALE + FE0F. A tone modifier and an
    // emoji-presentation selector are mutually exclusive: leaving the FE0F in
    // produces a sequence no font ships, which renders as a ball, a blob and a
    // Venus symbol side by side.
    const base = '⛹️‍♀️'
    const toned = applySkinTone(base, '\u{1F3FE}')
    assert.equal(toned, '⛹\u{1F3FE}‍♀️')
    assert.ok(!toned.includes('⛹️'), 'the FE0F survived in front of the modifier')
  })

  it('goes after the person in a joined sequence, not at the end', () => {
    // 🧑‍💻 is PERSON + ZWJ + LAPTOP. The tone belongs to the person.
    assert.equal(applySkinTone('🧑‍💻', '\u{1F3FB}'), '🧑\u{1F3FB}‍💻')
  })

  it('leaves alone what cannot be toned', () => {
    assert.equal(applySkinTone('🎉', '\u{1F3FD}', false), '🎉')
    assert.equal(applySkinTone('👍', ''), '👍')
  })

  it('strips back to the base', () => {
    for (const tone of ['\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}']) {
      assert.equal(stripSkinTone(applySkinTone('👍', tone as never)), '👍')
      assert.equal(stripSkinTone(applySkinTone('🧑‍💻', tone as never)), '🧑‍💻')
    }
  })
})

describe('§2.8 Frequently Used is actually frequency', () => {
  it('counts a toned emoji as its base, so one emoji is one entry', () => {
    let counts = bumpFrequent({}, '👍\u{1F3FD}')
    counts = bumpFrequent(counts, '👍')
    assert.deepEqual(counts, { '👍': 2 })
  })

  it('puts what you use ahead of the defaults', () => {
    // 🦕 is in no default list. Using it once must beat every default.
    const counts = bumpFrequent({}, '🦕')
    assert.equal(rankFrequent(counts)[0], '🦕')
  })

  it('orders by count, not by when it was last touched', () => {
    let counts: Record<string, number> = {}
    for (let i = 0; i < 5; i++) counts = bumpFrequent(counts, '🐛')
    counts = bumpFrequent(counts, '🦕')
    assert.deepEqual(rankFrequent(counts).slice(0, 2), ['🐛', '🦕'])
  })

  it('is always full, and never lists the same emoji twice', () => {
    const counts = bumpFrequent(bumpFrequent({}, '👍'), '🦕')
    const row = rankFrequent(counts)
    assert.equal(row.length, FREQUENT_SHOWN)
    assert.equal(new Set(row).size, row.length, 'an emoji is in the row twice')
  })

  it('shows the defaults before anything has been used', () => {
    assert.deepEqual(rankFrequent({}).slice(0, 3), DEFAULT_FREQUENT.slice(0, 3))
  })

  it('does not grow without bound', () => {
    let counts: Record<string, number> = {}
    for (let i = 0; i < 200; i++) counts = bumpFrequent(counts, `e${i}`)
    assert.ok(Object.keys(counts).length <= 60, `kept ${Object.keys(counts).length} entries`)
  })
})

describe('§2.8 search finds the emoji people mean', () => {
  const entries: EmojiEntry[] = [
    { char: '😀', name: 'grinning face', tone: false },
    { char: '😄', name: 'grinning face with smiling eyes', tone: false },
    { char: '🎉', name: 'party popper', tone: false },
    { char: '🐸', name: 'frog', tone: false },
    { char: '👍', name: 'thumbs up', tone: true },
  ]

  it('finds the shortcodes people have typed for a decade', () => {
    // Unicode does not use the word "tada" or "+1" anywhere.
    assert.equal(searchEmoji(entries, 'tada')[0].char, '🎉')
    assert.equal(searchEmoji(entries, '+1')[0].char, '👍')
  })

  it('ranks the name that starts with the query first', () => {
    const hits = searchEmoji(entries, 'party')
    assert.equal(hits[0].char, '🎉')
  })

  it('matches a word inside the name, below one that opens with it', () => {
    const hits = searchEmoji(entries, 'face').map((e) => e.char)
    assert.deepEqual(hits, ['😀', '😄'])
    assert.ok(scoreEmoji(entries[0], 'grinning') > scoreEmoji(entries[0], 'face'))
  })

  it('returns nothing for an empty query rather than everything', () => {
    assert.deepEqual(searchEmoji(entries, '   '), [])
  })

  it('finds nothing when there is nothing', () => {
    assert.deepEqual(searchEmoji(entries, 'zzzzz'), [])
  })

  it('caps the result count so one letter does not render the library', () => {
    const many: EmojiEntry[] = Array.from({ length: 500 }, (_, i) => ({
      char: `x${i}`,
      name: `alpha thing ${i}`,
      tone: false,
    }))
    assert.equal(searchEmoji(many, 'alpha').length, 60)
  })
})

describe('§2.8 the generated catalog is the whole library', () => {
  it('parses a category line into its three fields', () => {
    assert.deepEqual(parseCategory('👍|thumbs up|1\n🎉|party popper'), [
      { char: '👍', name: 'thumbs up', tone: true },
      { char: '🎉', name: 'party popper', tone: false },
    ])
  })

  it('loads every Unicode category with real emoji in it', async () => {
    const { catalog, all } = await loadEmojiCatalog()
    // The point of the gap: "poori ki poori emoji icons ki list". Twelve was
    // the old picker; anything in the hundreds is a different product.
    assert.ok(all.length > 1500, `only ${all.length} emoji in the catalog`)
    for (const { id } of EMOJI_CATEGORIES) {
      if (id === 'frequent' || id === 'custom') continue
      const entries = catalog[id]
      assert.ok(entries?.length > 20, `category ${id} has ${entries?.length ?? 0} emoji`)
      for (const e of entries) {
        assert.ok(e.char.length > 0, `${id} has an entry with no character`)
        assert.ok(e.name.length > 0, `${id}: ${e.char} has no name`)
      }
    }
  })

  it('marks tones only where a tone can be applied safely', async () => {
    const { all } = await loadEmojiCatalog()
    const toneable = all.filter((e) => e.tone)
    assert.ok(toneable.length > 200, `only ${toneable.length} emoji accept a skin tone`)
    // A couple carries two people; toning one of them is not a real sequence,
    // so the generator must have left those out.
    assert.ok(!all.find((e) => e.char === '👩‍❤️‍👨')?.tone, 'a two-person emoji was marked toneable')
    assert.equal(all.find((e) => e.char === '👍')?.tone, true)
  })

  it('every alias points at an emoji that is actually in the catalog', async () => {
    const { all } = await loadEmojiCatalog()
    const known = new Set(all.map((e) => e.char))
    const { EMOJI_ALIASES } = await import('./emoji-picker')
    for (const char of Object.keys(EMOJI_ALIASES)) {
      assert.ok(known.has(char), `alias target ${char} is not in the catalog`)
    }
    for (const char of DEFAULT_FREQUENT) {
      assert.ok(known.has(char), `default frequent ${char} is not in the catalog`)
    }
  })
})
