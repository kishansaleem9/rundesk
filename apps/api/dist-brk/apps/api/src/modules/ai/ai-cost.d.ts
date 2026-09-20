/**
 * Single source of truth for AI (Claude) cost estimation.
 *
 * Rough per-million-token pricing (USD) used to *estimate* cost in reports and
 * the SaaS Ops dashboard. Extracted out of ai.service.ts so both the per-user
 * usage summary (Plan §7.15) and the cross-tenant Ops metrics (Plan §14.5) share
 * exactly one pricing table + math. Unknown models fall back to { in: 1, out: 5 }.
 */
export declare const MODEL_PRICING: Record<string, {
    in: number;
    out: number;
}>;
/**
 * Estimated USD cost of a call given its model and token counts. Pricing is per
 * million tokens: (inputTokens / 1e6) * priceIn + (outputTokens / 1e6) * priceOut.
 */
export declare function estimateAiCostUsd(model: string, inputTokens: number, outputTokens: number): number;
