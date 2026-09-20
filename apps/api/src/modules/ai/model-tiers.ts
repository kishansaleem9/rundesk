/**
 * §15 / §V2-S18 — the composer's model picker, frames `296_1817` / `301_1836` /
 * `302_1842`, and the one this row is really about: `[17:16]`.
 *
 * WHAT THE FRAME DRAWS, zoomed rather than remembered: a popover headed **Best
 * models**, three rows each with a provider glyph — `Brain² [Max]` with a tick,
 * `GPT-5.6 Luna`, `Gemini 3.5 Flash` — a hover card carrying a one-line
 * description with **Speed** and **Intelligence** bars, and, under a rule, a
 * **Show more** disclosure. `[17:16]`–`[17:21]`: "aap ChatGPT ko bhi use kar
 * sakte ho, Gemini ke features bhi use kar sakte ho; agar aap 'Show More' pe
 * jaoge to aap CLAUDE ke features bhi use kar sakte ho."
 *
 * WHAT IS BUILT, AND THE ONE THING THAT IS NOT.
 *
 * The STRUCTURE is built: a grouped list, a disclosure, hover detail, and a
 * preferred model that is persisted server-side (`ai_model_preferences`, 0150)
 * instead of in one browser's `localStorage`.
 *
 * The ROUTING to OpenAI and Google is not, and must not be faked. There is no
 * OpenAI or Google client anywhere in `apps/api` — no SDK, no key, no adapter.
 * Adding "ChatGPT" and "Gemini" as pickable entries here would produce a
 * control that changes a stored value and then sends the request to Claude
 * regardless: the facade this audit exists to catch, and the worst kind,
 * because the stored value would be evidence the feature exists.
 *
 * So the two lists are separate BY TYPE, not by a boolean anybody can flip:
 *
 *   · `MODEL_TIERS` is what `modelForTier` can resolve. Every entry routes.
 *   · `UNROUTABLE_PROVIDERS` is what the frame shows and this product cannot
 *     do. Entries carry the REASON, the surface renders them unselectable, and
 *     no code path can turn one into a model id — there is no field to hold it.
 *
 * The day an OpenAI client lands, that provider moves across as a `ModelTier`
 * with a real `model`, and the picker needs no change at all.
 */
export interface ModelTier {
  id: 'fast' | 'deep'
  /** The Anthropic model this actually resolves to. */
  model: string
  /** Shown in the picker. */
  label: string
  /** One line, so the choice can be made without knowing model names. */
  hint: string
  /** Who makes it. Drawn as the row's glyph, as the frame does. */
  provider: 'anthropic'
  /**
   * `best` is the frame's "Best models" group; `more` is what its **Show more**
   * reveals. Rundesk has two tiers and both are worth offering, so both are
   * `best` and the disclosure carries the providers it cannot route to — which
   * is the honest inversion of the frame, where Claude was the hidden one.
   */
  group: 'best'
  /** 1–5, the frame's hover-card bars. Relative to each other, not absolute. */
  speed: number
  intelligence: number
}

/**
 * A provider the frame offers and Rundesk cannot reach.
 *
 * There is deliberately NO `model` field. A shape that cannot hold a model id
 * cannot be accidentally routed to, however the picker is later rewritten.
 */
export interface UnroutableProvider {
  id: 'openai' | 'google'
  /** The name on the row, as the frame writes it. */
  label: string
  provider: 'openai' | 'google'
  /**
   * A translation key, not a sentence: this is shown to a person, in four
   * locales, and an English string baked into the API would appear untranslated
   * on three of them.
   */
  reasonKey: 'aiModels.reasonNoOpenAiClient' | 'aiModels.reasonNoGoogleClient'
}

export const MODEL_TIERS: readonly ModelTier[] = [
  {
    id: 'deep',
    model: 'claude-sonnet-4-6',
    label: 'Deep',
    hint: 'Slower, better at reasoning through your workspace',
    provider: 'anthropic',
    group: 'best',
    speed: 3,
    intelligence: 5,
  },
  {
    id: 'fast',
    model: 'claude-haiku-4-5',
    label: 'Fast',
    hint: 'Quick answers, short questions',
    provider: 'anthropic',
    group: 'best',
    speed: 5,
    intelligence: 3,
  },
] as const

/**
 * The two the frame names that this product has no client for.
 *
 * Listed rather than omitted on purpose. Omitting them answers "can I use
 * ChatGPT here" with silence, and silence is read as "not yet, probably soon".
 * Naming them with the reason answers it.
 */
export const UNROUTABLE_PROVIDERS: readonly UnroutableProvider[] = [
  {
    id: 'openai',
    label: 'ChatGPT',
    provider: 'openai',
    reasonKey: 'aiModels.reasonNoOpenAiClient',
  },
  {
    id: 'google',
    label: 'Gemini',
    provider: 'google',
    reasonKey: 'aiModels.reasonNoGoogleClient',
  },
] as const

/** What chat used before a picker existed, so the default changes nothing. */
export const DEFAULT_TIER: ModelTier['id'] = 'deep'

/**
 * Resolve a requested tier to a model.
 *
 * Anything unrecognised falls back to the default rather than throwing: a bad
 * value in a query string should not cost someone their answer, and the caller
 * has no better option to offer them than the one they would have got anyway.
 *
 * This is also the choke point that keeps the unroutable list honest. Ask it
 * for `openai` and it returns Claude — because that IS what would happen — so
 * any attempt to make those rows selectable shows up as the wrong model in
 * `ai_usage.model`, where the activity log will print it.
 */
export function modelForTier(tier: string | undefined | null): string {
  const found = MODEL_TIERS.find((t) => t.id === tier)
  return (found ?? MODEL_TIERS.find((t) => t.id === DEFAULT_TIER)!).model
}

export function tierFor(tier: string | undefined | null): ModelTier {
  return MODEL_TIERS.find((t) => t.id === tier) ?? MODEL_TIERS.find((t) => t.id === DEFAULT_TIER)!
}

/**
 * Is this a tier somebody may store as their preference?
 *
 * The preference write refuses anything else instead of coercing it. Coercion
 * is how "I set Gemini and it saved" becomes true on a product that cannot run
 * Gemini — the row would round-trip through Postgres and mean nothing.
 */
export function isSelectableTier(tier: unknown): tier is ModelTier['id'] {
  return typeof tier === 'string' && MODEL_TIERS.some((t) => t.id === tier)
}
