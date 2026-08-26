/**
 * §2.8 gap 7 — the emoji picker's decisions, kept away from its markup.
 *
 *   `[20:22]` "poori ki poori emoji icons ki list" — the whole list, with a
 *   Search field, a Frequently Used section, a Smiles & People grid, a category
 *   strip along the bottom, and a `+` for a custom one.
 *
 * The strip Rundesk had was twelve hard-coded emoji. Everything here exists so
 * that the picker can be the real thing without pulling in a picker library:
 * the data is generated from Unicode (see scripts/generate-emoji-data.mjs) and
 * loaded on first open, and every judgement it makes — what "frequently used"
 * means, what a search matches, where a skin tone goes — is a plain function
 * that can be checked without a browser.
 */
import type { TranslationKey } from './i18n'

export interface EmojiEntry {
  /** The character itself, untoned. */
  char: string
  /** Unicode's name — the thing search reads. */
  name: string
  /** Whether a skin tone may be applied (see the generator for the exceptions). */
  tone: boolean
}

export type CategoryId =
  | 'frequent'
  | 'people'
  | 'nature'
  | 'food'
  | 'activity'
  | 'travel'
  | 'objects'
  | 'symbols'
  | 'flags'
  | 'custom'

/**
 * The bottom strip, in the order the reference showed it. `frequent` and
 * `custom` are the two that come from the person rather than from Unicode, and
 * they bookend the list for that reason.
 *
 * Icons live with the component; this stays free of React so it can be tested
 * as what it is — a list of decisions about emoji.
 */
export const EMOJI_CATEGORIES: Array<{ id: CategoryId; labelKey: TranslationKey }> = [
  { id: 'frequent', labelKey: 'emoji.frequent' },
  { id: 'people', labelKey: 'emoji.people' },
  { id: 'nature', labelKey: 'emoji.nature' },
  { id: 'food', labelKey: 'emoji.food' },
  { id: 'activity', labelKey: 'emoji.activity' },
  { id: 'travel', labelKey: 'emoji.travel' },
  { id: 'objects', labelKey: 'emoji.objects' },
  { id: 'symbols', labelKey: 'emoji.symbols' },
  { id: 'flags', labelKey: 'emoji.flags' },
  { id: 'custom', labelKey: 'emoji.custom' },
]

/** The five Fitzpatrick modifiers, plus the untoned default. */
export const SKIN_TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'] as const
export type SkinTone = (typeof SKIN_TONES)[number]

const VARIATION_SELECTOR_16 = '️'

/**
 * Put a skin tone on an emoji.
 *
 * The modifier goes immediately after the character it colours, and it
 * *replaces* the emoji-presentation selector when one is there — ⛹️‍♀️ tones to
 * ⛹🏽‍♀️, not ⛹️🏽‍♀️, which is a different (and unrenderable) sequence. Anything
 * the generator marked untoneable comes back untouched.
 */
export function applySkinTone(char: string, tone: SkinTone, canTone = true): string {
  if (!tone || !canTone) return char
  const points = [...char]
  const rest = points.slice(1)
  if (rest[0] === VARIATION_SELECTOR_16) rest.shift()
  return points[0] + tone + rest.join('')
}

/** Strip any tone back off, so a toned emoji still counts as its base for recency. */
export function stripSkinTone(char: string): string {
  return [...char].filter((c) => {
    const cp = c.codePointAt(0)!
    return cp < 0x1f3fb || cp > 0x1f3ff
  }).join('')
}

/**
 * Words people type that are not in any Unicode name.
 *
 * Unicode calls 👍 "thumbs up" and 🎉 a "party popper", so searching "+1" or
 * "tada" — the shortcodes half the industry has typed for a decade — finds
 * nothing at all. These are the ones worth carrying by hand; everything else
 * search gets for free from the names.
 */
export const EMOJI_ALIASES: Record<string, string[]> = {
  '👍': ['+1', 'thumbsup', 'yes', 'agree', 'like', 'approve'],
  '👎': ['-1', 'thumbsdown', 'no', 'disagree'],
  '🎉': ['tada', 'celebrate', 'party', 'ship', 'launch'],
  '💯': ['100', 'hundred', 'perfect'],
  '👀': ['eyes', 'looking', 'reviewing'],
  '🚀': ['ship', 'launch', 'deploy', 'shipit'],
  '✅': ['check', 'done', 'tick', 'complete'],
  '❌': ['x', 'cross', 'no', 'fail'],
  '🔥': ['fire', 'lit', 'hot', 'great'],
  '❤️': ['heart', 'love'],
  '🙏': ['pray', 'thanks', 'please', 'thankyou'],
  '😂': ['lol', 'laugh', 'funny'],
  '🤔': ['thinking', 'hmm'],
  '🙌': ['raised hands', 'celebrate', 'praise'],
  '👏': ['clap', 'applause', 'welldone', 'bravo'],
  '😅': ['sweat', 'phew'],
  '🐛': ['bug', 'defect'],
  '⚠️': ['warning', 'careful'],
  '🎯': ['target', 'goal', 'bullseye'],
  '☕': ['coffee', 'break'],
}

/**
 * What the Frequently Used row shows before anyone has used anything.
 *
 * An empty first section would read as a broken picker. These are the reactions
 * a work chat actually produces, and the first three are the same three the
 * message hover bar offers. There are exactly as many as the row is long, so
 * the section is the same size on day one as on day two hundred and does not
 * grow a row under the cursor as usage accumulates.
 */
export const DEFAULT_FREQUENT = [
  '👍', '✅', '🔥', '😀', '🎉', '❤️',
  '🙏', '👀', '😂', '🚀', '👏', '💯',
  '🤔', '😅', '🙌', '✨', '🐛', '⚠️',
]

/** Two rows, as in the reference. Anything past this is one scroll away anyway. */
export const FREQUENT_SHOWN = 18
/** Recency is a hint, not an archive — keep the map from growing without bound. */
const FREQUENT_KEPT = 60

export type FrequentCounts = Record<string, number>

/** Record one use. Toned emoji count towards their base so 👍🏽 and 👍 are one entry. */
export function bumpFrequent(counts: FrequentCounts, char: string): FrequentCounts {
  const key = stripSkinTone(char)
  const next: FrequentCounts = { ...counts, [key]: (counts[key] ?? 0) + 1 }
  const kept = Object.entries(next)
    .sort((a, b) => b[1] - a[1])
    .slice(0, FREQUENT_KEPT)
  return Object.fromEntries(kept)
}

/**
 * The Frequently Used row: what has been used, most first, topped up with the
 * defaults so the row is always full and never jumps around in length.
 */
export function rankFrequent(counts: FrequentCounts, limit = FREQUENT_SHOWN): string[] {
  const used = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([char]) => char)
  const out = [...used]
  for (const char of DEFAULT_FREQUENT) {
    if (out.length >= limit) break
    if (!out.includes(char)) out.push(char)
  }
  return out.slice(0, limit)
}

/**
 * Score one emoji against a query. Higher is better; 0 means no match.
 *
 * Ranking matters more than matching here: "smile" matches thirty names, and
 * the one called exactly that should not be thirtieth. An alias hit outranks a
 * mid-word name hit because someone typing "tada" means the popper, not
 * "tadpole".
 */
export function scoreEmoji(entry: EmojiEntry, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  if (entry.char === q) return 100
  const name = entry.name.toLowerCase()
  if (name === q) return 90
  const aliases = EMOJI_ALIASES[entry.char]
  if (aliases?.includes(q)) return 85
  if (name.startsWith(`${q} `) || name.startsWith(`${q}-`)) return 70
  if (aliases?.some((a) => a.startsWith(q))) return 60
  // A word inside the name: "face" should find "grinning face", but rank it
  // below the emoji whose name opens with it.
  if (name.split(/[\s-]+/).some((w) => w.startsWith(q))) return 50
  if (name.includes(q)) return 20
  return 0
}

/**
 * Workspace custom emoji matching a query.
 *
 * Search only ever looked at the Unicode list, so typing "shipit" in a
 * workspace that has a `:shipit:` emoji answered "No emoji matches that" —
 * and because the category sections are unmounted during a search, the Custom
 * section was not visible either. The emoji looked deleted.
 */
export function searchCustomEmoji<T extends { shortcode: string }>(
  custom: T[],
  query: string,
  limit = 12,
): T[] {
  const q = query.trim().toLowerCase().replace(/^:|:$/g, '')
  if (!q) return []
  const scored = custom
    .map((c) => {
      const code = c.shortcode.toLowerCase()
      if (code === q) return { c, score: 3 }
      if (code.startsWith(q)) return { c, score: 2 }
      if (code.includes(q)) return { c, score: 1 }
      return { c, score: 0 }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((x) => x.c)
}

/** The search results, best first, capped so a one-letter query stays usable. */
export function searchEmoji(all: EmojiEntry[], query: string, limit = 60): EmojiEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: Array<{ entry: EmojiEntry; score: number; index: number }> = []
  for (let i = 0; i < all.length; i++) {
    const score = scoreEmoji(all[i], q)
    // Unicode order is a real ordering (faces before hands before objects), so
    // ties keep it rather than falling back to whatever sort() decides.
    if (score > 0) scored.push({ entry: all[i], score, index: i })
  }
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.slice(0, limit).map((s) => s.entry)
}

/** Turn one generated category string back into entries. */
export function parseCategory(raw: string): EmojiEntry[] {
  if (!raw) return []
  return raw.split('\n').map((line) => {
    const [char, name, tone] = line.split('|')
    return { char, name, tone: tone === '1' }
  })
}

export type EmojiCatalog = Record<Exclude<CategoryId, 'frequent' | 'custom'>, EmojiEntry[]>

let catalogPromise: Promise<{ catalog: EmojiCatalog; all: EmojiEntry[] }> | null = null

/**
 * Load the emoji list. 1,900 emoji is ~43 KB that nobody needs until they open
 * the picker, so it is a separate chunk fetched on first open and then held.
 */
export function loadEmojiCatalog(): Promise<{ catalog: EmojiCatalog; all: EmojiEntry[] }> {
  if (!catalogPromise) {
    catalogPromise = import('./emoji-data')
      .catch((error) => {
        /*
         * A FAILED load must not be remembered.
         *
         * Holding the rejected promise meant one bad fetch — a deploy that
         * rotated the content-hashed chunk, a moment of no network — poisoned
         * every later open for the rest of the session: the same rejection
         * came back instantly, the `.then` never ran, and the picker showed a
         * pulsing skeleton forever with no retry and nothing said.
         */
        catalogPromise = null
        throw error
      })
      .then(({ EMOJI_BY_CATEGORY }) => {
        const catalog = {} as EmojiCatalog
        const all: EmojiEntry[] = []
        for (const { id } of EMOJI_CATEGORIES) {
          if (id === 'frequent' || id === 'custom') continue
          const entries = parseCategory(EMOJI_BY_CATEGORY[id] ?? '')
          catalog[id] = entries
          all.push(...entries)
        }
        return { catalog, all }
      })
  }
  return catalogPromise
}

const FREQUENT_KEY = 'rundesk.emoji.frequent'
const TONE_KEY = 'rundesk.emoji.tone'

/** Read the recency map. Anything unreadable is treated as "nothing yet". */
export function readFrequent(): FrequentCounts {
  try {
    const raw = localStorage.getItem(FREQUENT_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: FrequentCounts = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'number' && v > 0) out[k] = v
    return out
  } catch {
    return {}
  }
}

export function writeFrequent(counts: FrequentCounts): void {
  try {
    localStorage.setItem(FREQUENT_KEY, JSON.stringify(counts))
  } catch {
    // A full or blocked store costs the person nothing but a shuffled first row.
  }
}

export function readSkinTone(): SkinTone {
  try {
    const raw = localStorage.getItem(TONE_KEY) ?? ''
    return (SKIN_TONES as readonly string[]).includes(raw) ? (raw as SkinTone) : ''
  } catch {
    return ''
  }
}

export function writeSkinTone(tone: SkinTone): void {
  try {
    localStorage.setItem(TONE_KEY, tone)
  } catch {
    /* see writeFrequent */
  }
}
