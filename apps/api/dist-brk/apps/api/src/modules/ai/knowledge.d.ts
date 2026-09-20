/**
 * Pure helpers + curated knowledge for the two §14.4 / §15.1 AI surfaces.
 *
 * Kept free of NestJS/DB imports so every piece is unit-testable without a
 * database or a live model:
 *   - §15.1 Knowledge base: id parsing, context assembly, and the deterministic
 *     "matches found" answer used when the model is unavailable. Retrieval is a
 *     REAL vector/embeddings store — the question is embedded and ranked by
 *     cosine similarity against `knowledge_embeddings` (see embedding.ts +
 *     knowledge-indexer.service.ts + AiService.retrieveKnowledgeHits); these
 *     helpers turn the ranked, access-filtered hits into cited sources and
 *     never fabricate.
 *   - §14.4 Help center: a compact, curated help/FAQ knowledge base embedded as
 *     a constant, plus the keyword matcher that backs the deterministic fallback.
 */
/** A raw hit as returned by SearchService.search(). */
export type RawSearchHit = {
    id: string;
    entityType: string;
    title: string;
    content: string;
    url: string;
};
/** A cited source returned to the client. */
export type KnowledgeSource = {
    type: string;
    id: string;
    title: string;
    url: string;
};
/**
 * Split a prefixed search id (`task-<uuid>`, `doc-<uuid>`, `comment-<uuid>`, …)
 * into its entity type and raw id. Ids that carry no prefix map to themselves.
 */
export declare function splitSearchId(id: string): {
    type: string;
    rawId: string;
};
/** Map a raw search hit to the cited-source shape returned to the client. */
export declare function hitToSource(hit: RawSearchHit): KnowledgeSource;
/**
 * Assemble the compact, numbered context block fed to the model. Each hit is a
 * `[n]` citation the model is told to reference. Token-bounded: caps to 8 items
 * and trims each snippet to 240 chars.
 */
export declare function assembleKnowledgeContext(hits: RawSearchHit[]): string;
/**
 * Deterministic answer used when the model is unavailable or errors. Reports the
 * matches found and points at the sources — it NEVER fabricates an answer.
 */
export declare function deterministicKnowledgeAnswer(question: string, sources: KnowledgeSource[]): string;
export type HelpTopic = {
    /** Stable slug — also the on-page FAQ anchor for the four headline topics. */
    id: string;
    question: string;
    answer: string;
    keywords: string[];
};
/**
 * Curated help/FAQ knowledge base (§14.4). This is the ONLY ground truth fed to
 * the model, and the corpus the deterministic keyword fallback matches against.
 * The first four ids mirror the on-page FAQ cards so cited sources can deep-link.
 */
export declare const HELP_TOPICS: HelpTopic[];
/** Tokenize free text into lowercased, de-stopworded terms of length ≥ 3. */
export declare function helpTokens(text: string): string[];
/**
 * Deterministic keyword match (§14.4 fallback): score each help topic by how
 * many distinct question terms hit its keywords/title, and return the closest
 * `limit` with score > 0, best first. Ties break by topic order (stable).
 */
export declare function matchHelpTopics(question: string, topics?: HelpTopic[], limit?: number): Array<HelpTopic & {
    score: number;
}>;
/** Assemble the curated help KB as the grounding block for the model. */
export declare function formatHelpKnowledgeBase(topics?: HelpTopic[]): string;
/** Map a help topic to a cited source that deep-links to the on-page FAQ. */
export declare function helpTopicToSource(topic: HelpTopic): KnowledgeSource;
export declare const HELP_NO_MATCH = "I couldn't find a matching help topic. Try rephrasing your question, or contact support and we'll be glad to help.";
