import { ConfigService } from '@nestjs/config';
/** An embedded piece of text: its L2-normalized vector and that vector's length. */
export type Embedding = {
    vector: number[];
    dim: number;
};
/**
 * §15.1 pluggable embedder. Two paths, chosen once at construction:
 *
 *   - REAL API (env-gated): when `OPENAI_API_KEY` (or `EMBEDDINGS_API_KEY`) is
 *     set, embeddings are produced by a real embeddings model
 *     (`text-embedding-3-small` by default, overridable via `EMBEDDINGS_MODEL`).
 *     Vectors are L2-normalized before use so cosine == dot product.
 *
 *   - DETERMINISTIC LOCAL (default, always available, the TESTED path): a pure
 *     hashed bag-of-words + char-trigram embedder (see embedding.ts). No key, no
 *     network, no downloads — fully offline and reproducible.
 *
 * The same instance is used at index-time and query-time, so a workspace's
 * stored vectors and the question vector are always produced by the same
 * embedder (and therefore share a dimension).
 */
export declare class EmbeddingService {
    private readonly config;
    private readonly logger;
    private readonly apiKey?;
    private readonly model;
    private readonly localDim;
    constructor(config: ConfigService);
    /** True when a real embeddings API is configured (env-gated). */
    usesApi(): boolean;
    /** The dimensionality of vectors produced by the local (default) embedder. */
    get dim(): number;
    /** Embed a single piece of text into an L2-normalized vector. */
    embed(text: string): Promise<Embedding>;
    /**
     * Embed a batch of texts. Uses one API request for the whole batch when the
     * API path is active; otherwise maps the pure local embedder. Order-preserving.
     */
    embedBatch(texts: string[]): Promise<Embedding[]>;
    /**
     * Call the OpenAI-compatible embeddings endpoint and return L2-normalized
     * vectors. Env-gated (only reached when a key is set). Throws on failure so
     * callers never silently mix API vectors with local ones (which would have a
     * different dimension) — the indexer/retrieval degrade gracefully instead.
     */
    private embedViaApi;
}
