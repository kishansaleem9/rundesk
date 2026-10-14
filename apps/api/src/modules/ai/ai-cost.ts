/**
 * Single source of truth for AI (Claude) cost estimation.
 *
 * Rough per-million-token pricing (USD) used to *estimate* cost in reports and
 * the SaaS Ops dashboard. Extracted out of ai.service.ts so both the per-user
 * usage summary (Plan §7.15) and the cross-tenant Ops metrics (Plan §14.5) share
 * exactly one pricing table + math. Unknown models fall back to { in: 1, out: 5 }.
 */
export const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  // §V2-S18 `[17:16]` — one row per routable `MODEL_TIERS` entry. A tier whose
  // model is missing here does not fail; it silently falls back to the Haiku
  // price below and under-reports its own cost by 5×, which is the confident
  // zero in a currency. `model-tiers.test.ts` asserts every tier is priced.
  'claude-opus-5': { in: 5, out: 25 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  // ChatGPT's and Gemini's defaults (`chat-providers.ts`), at their list prices
  // of 14 October (aggregators' tables, through search excerpts). A model named by
  // CHATGPT_MODEL or GEMINI_MODEL beyond these is estimated at the fallback.
  'gpt-5.4': { in: 2.5, out: 15 },
  'gemini-3-flash-preview': { in: 0.5, out: 3 },
}

/**
 * Estimated USD cost of a call given its model and token counts. Pricing is per
 * million tokens: (inputTokens / 1e6) * priceIn + (outputTokens / 1e6) * priceOut.
 */
export function estimateAiCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[model] ?? { in: 1, out: 5 }
  return (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out
}
