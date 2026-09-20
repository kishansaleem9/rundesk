/**
 * Pure, dependency-free embedding + vector math for the §15.1 semantic
 * Knowledge Base. Kept free of NestJS/DB imports so every piece is
 * unit-testable and usable both at index-time and query-time.
 *
 * The deterministic local embedder is a real, L2-normalized hashed
 * bag-of-words + character-trigram vector (fixed dim, default 256). It is:
 *   - PURE — same text always yields the same vector (no randomness, no time).
 *   - LEXICAL-SEMANTIC — words AND sub-word trigrams hash into buckets, so
 *     "launch"/"launching" and texts sharing vocabulary land closer together
 *     than unrelated texts. Genuine cosine similarity, not keyword equality.
 *   - OFFLINE — no downloads, no external API, microseconds per call.
 * This is the tested default. A real embeddings API (OpenAI
 * `text-embedding-3-small`) is env-gated in EmbeddingService; both paths return
 * L2-normalized vectors so cosine == dot product either way.
 */
/** Default embedding dimensionality for the deterministic local embedder. */
export declare const DEFAULT_EMBED_DIM = 256;
/**
 * FNV-1a 32-bit string hash. Deterministic and fast; used to map tokens/grams
 * into embedding buckets. `Math.imul` keeps the multiply in 32-bit space.
 */
export declare function fnv1a(str: string): number;
/** Tokenize free text into lowercased, de-stopworded terms of length ≥ 2. */
export declare function embedTokens(text: string): string[];
/** L2-normalize a vector in place-free fashion. A zero vector is returned as-is. */
export declare function l2normalize(vec: number[]): number[];
/**
 * Deterministic local embedding of `text` into a fixed-dim, L2-normalized
 * vector. Combines three lexical signals hashed into the same space:
 *   - whole word tokens (weight 1.0)
 *   - word bigrams (weight 0.75) — a little phrase sense
 *   - padded character trigrams (weight 0.5) — sub-word / morphological overlap
 * Pure: no randomness, no I/O. Returns a zero vector for empty/stopword-only
 * input (cosine with anything is then 0, which is correct).
 */
export declare function embedText(text: string, dim?: number): number[];
/**
 * Cosine similarity of two vectors. When both are L2-normalized (as everything
 * stored here is) this is just the dot product. Guards against length
 * mismatches by comparing only the shared prefix — but callers should prefer
 * to skip mismatched-dim rows entirely (see retrieval).
 */
export declare function cosineSimilarity(a: number[], b: number[]): number;
/**
 * Stable content hash for skip-unchanged re-indexing. Uses FNV-1a over the
 * normalized text, hex-encoded and prefixed with the length to make accidental
 * collisions astronomically unlikely for our purposes. Pure + no crypto import.
 */
export declare function contentHash(text: string): string;
