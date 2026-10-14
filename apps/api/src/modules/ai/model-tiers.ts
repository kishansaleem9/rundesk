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
 * WHAT IS BUILT. A bounded group of three, a disclosure holding the rest, a
 * hover card per row carrying its one line and its two bars, and a preferred
 * model that is persisted server-side (`ai_model_preferences`, 0150) instead of
 * in one browser's `localStorage`. And, since 14 October, ChatGPT and Gemini
 * answer as well as Claude (`commit-log/log-39863ff-1`): through OpenAI's Chat
 * Completions API, which Gemini speaks too at its compatible address
 * (`chat-providers.ts`), each where this server has its key.
 *
 * A PROVIDER WITHOUT ITS KEY IS STILL NOT FAKED. A pickable "Gemini" that sent
 * the request to Claude would be a control that changes a stored value and then
 * answers from somebody else: the facade this audit exists to catch, and the
 * worst kind, because the stored value would be evidence the feature exists.
 *
 * So the two lists stay separate BY TYPE, not by a boolean anybody can flip:
 *
 *   · `models` (`modelCatalog`) is what `tierFor` can resolve. Every entry
 *     routes: Claude's three, and each other provider whose key is set.
 *   · `unavailable` is each provider whose key is not. Entries carry the
 *     REASON, the surface renders them unselectable, and no code path can turn
 *     one into a model id — there is no field to hold it.
 *
 * A key set moves its provider across as a `ModelTier` with a real `model`, and
 * the picker needs no change at all.
 */
export type ModelProvider = 'anthropic' | 'openai' | 'google'

export interface ModelTier {
  id: 'fast' | 'deep' | 'max' | 'chatgpt' | 'gemini'
  /** The model this actually resolves to, at its provider. */
  model: string
  /** Shown in the picker. */
  label: string
  /** One line, so the choice can be made without knowing model names. */
  hint: string
  /** Who makes it, and so which client answers. Drawn as the row's glyph, as the frame does. */
  provider: ModelProvider
  /**
   * `best` is the frame's "Best models" group; `more` is what its **Show more**
   * reveals. Every routable tier declares itself `best`; whether it is actually
   * DRAWN there is decided by `splitPickerModels` below, because the frame
   * bounds the visible list at three and a group flag on each row cannot.
   */
  group: 'best'
  /** 1–5, the frame's hover-card bars. Relative to each other, not absolute. */
  speed: number
  intelligence: number
}

/**
 * A provider the frame offers and this server has no key for.
 *
 * There is deliberately NO `model` field. A shape that cannot hold a model id
 * cannot be accidentally routed to, however the picker is later rewritten.
 */
export interface UnroutableProvider {
  id: 'chatgpt' | 'gemini'
  /** The name on the row, as the frame writes it. */
  label: string
  provider: 'openai' | 'google'
  /**
   * A translation key, not a sentence: this is shown to a person, in four
   * locales, and an English string baked into the API would appear untranslated
   * on three of them.
   */
  reasonKey: 'aiModels.reasonChatGptNotSetUp' | 'aiModels.reasonGeminiNotSetUp'
}

/**
 * Ordered as the popover draws them: most capable first, which is the order
 * `[17:16]` shows (`Brain² Max` on top) and the order the tick was on.
 *
 * THREE, because the frame's "Best models" holds three rows. The third is not
 * padding: Opus is a model this server can genuinely reach, priced in
 * `ai-cost.ts` like the other two, and `modelForTier('max')` returns it, so
 * choosing it changes which model answers. A third LABEL over one of the two
 * existing models would have been the facade — two names for one thing — and
 * `ai-model-picker` asserts the models are distinct precisely to catch that.
 */
export const MODEL_TIERS: readonly ModelTier[] = [
  {
    id: 'max',
    model: 'claude-opus-5',
    label: 'Max',
    hint: 'Deepest reasoning for long, multi-step work',
    provider: 'anthropic',
    group: 'best',
    speed: 2,
    intelligence: 5,
  },
  {
    id: 'deep',
    model: 'claude-sonnet-4-6',
    label: 'Deep',
    hint: 'Balanced — reasons through your workspace without the wait',
    provider: 'anthropic',
    group: 'best',
    speed: 3,
    intelligence: 4,
  },
  {
    id: 'fast',
    model: 'claude-haiku-4-5',
    label: 'Fast',
    hint: 'Quick answers, short questions',
    provider: 'anthropic',
    group: 'best',
    speed: 5,
    intelligence: 2,
  },
] as const

/**
 * How many rows the frame's "Best models" group holds before **Show more**.
 *
 * `[17:16]` draws three and a disclosure; the earlier frame `17:15` shows the
 * disclosure open with seven. So the bound is on the SURFACE, not on the
 * catalogue — which is why it lives here beside the catalogue rather than in
 * the component: a fourth tier added below must fall behind the disclosure
 * automatically, and a component holding its own `slice(0, 3)` is the
 * duplicated-list defect waiting for its second copy.
 */
export const BEST_MODELS_VISIBLE = 3

/**
 * Split the picker into what is drawn and what **Show more** reveals.
 *
 * Pure, and takes the list rather than reading the constant, so the boundary
 * can be tested at four tiers without a fourth tier existing.
 */
export function splitPickerModels<T>(
  tiers: readonly T[],
  visible: number = BEST_MODELS_VISIBLE,
): { best: T[]; more: T[] } {
  const cut = Math.max(0, visible)
  return { best: tiers.slice(0, cut), more: tiers.slice(cut) }
}

/**
 * The two the frame names besides Claude, each a tier where this server has its
 * key and a named row with its reason where it has not.
 *
 * Listed rather than omitted when unset, on purpose. Omitting them answers "can
 * I use ChatGPT here" with silence, and silence is read as "not yet, probably
 * soon". Naming them with the reason answers it — and says what would change it.
 */
export const OTHER_PROVIDERS = [
  {
    provider: 'openai',
    tier: (model: string): ModelTier => ({
      id: 'chatgpt',
      model,
      label: 'ChatGPT',
      hint: `OpenAI’s ${model}, for a team that thinks in ChatGPT`,
      provider: 'openai',
      group: 'best',
      speed: 3,
      intelligence: 4,
    }),
    unset: { id: 'chatgpt', label: 'ChatGPT', provider: 'openai', reasonKey: 'aiModels.reasonChatGptNotSetUp' },
  },
  {
    provider: 'google',
    tier: (model: string): ModelTier => ({
      id: 'gemini',
      model,
      label: 'Gemini',
      hint: `Google’s ${model}, quick and broad`,
      provider: 'google',
      group: 'best',
      speed: 4,
      intelligence: 3,
    }),
    unset: { id: 'gemini', label: 'Gemini', provider: 'google', reasonKey: 'aiModels.reasonGeminiNotSetUp' },
  },
] as const satisfies ReadonlyArray<{
  provider: 'openai' | 'google'
  tier: (model: string) => ModelTier
  unset: UnroutableProvider
}>

/** Which other providers this server has a key for, and the model each answers with. */
export type ProviderModels = Partial<Record<'openai' | 'google', { model: string }>>

/**
 * The picker's catalogue on THIS server: Claude's three, then each other
 * provider with a key as a tier, and each without as a named row it cannot pick.
 *
 * Pure, and takes the providers rather than reading the environment, so both
 * halves can be tested without a key existing.
 */
export function modelCatalog(providers: ProviderModels = {}): {
  models: ModelTier[]
  unavailable: UnroutableProvider[]
} {
  const models: ModelTier[] = [...MODEL_TIERS]
  const unavailable: UnroutableProvider[] = []
  for (const p of OTHER_PROVIDERS) {
    const set = providers[p.provider]
    if (set?.model) models.push(p.tier(set.model))
    else unavailable.push({ ...p.unset })
  }
  return { models, unavailable }
}

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
 * for `gemini` on a server with no Gemini key and it returns Claude — because
 * that IS what would happen — so any attempt to make that row selectable shows
 * up as the wrong model in `ai_usage.model`, where the activity log prints it.
 * `models` is the server's catalogue (`modelCatalog`); left out, Claude's alone.
 */
export function modelForTier(tier: string | undefined | null, models: readonly ModelTier[] = MODEL_TIERS): string {
  return tierFor(tier, models).model
}

export function tierFor(tier: string | undefined | null, models: readonly ModelTier[] = MODEL_TIERS): ModelTier {
  return models.find((t) => t.id === tier) ?? MODEL_TIERS.find((t) => t.id === DEFAULT_TIER)!
}

/**
 * Is this a tier somebody may store as their preference, on this server?
 *
 * The preference write refuses anything else instead of coercing it. Coercion
 * is how "I set Gemini and it saved" becomes true on a server that cannot run
 * Gemini — the row would round-trip through Postgres and mean nothing.
 */
export function isSelectableTier(tier: unknown, models: readonly ModelTier[] = MODEL_TIERS): tier is ModelTier['id'] {
  return typeof tier === 'string' && models.some((t) => t.id === tier)
}
