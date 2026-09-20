"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_EMBED_DIM = void 0;
exports.fnv1a = fnv1a;
exports.embedTokens = embedTokens;
exports.l2normalize = l2normalize;
exports.embedText = embedText;
exports.cosineSimilarity = cosineSimilarity;
exports.contentHash = contentHash;
/** Default embedding dimensionality for the deterministic local embedder. */
exports.DEFAULT_EMBED_DIM = 256;
// Short, common English stopwords dropped before hashing (mirrors the help
// tokenizer). Kept tiny — the embedder is lexical, not grammatical.
const EMBED_STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'do', 'does', 'how', 'what', 'is', 'are', 'can',
    'i', 'my', 'me', 'we', 'you', 'your', 'with', 'about', 'it', 'this', 'that', 'from', 'get', 'up', 'so', 'if',
    'there', 'any', 'be', 'as', 'at', 'by', 'was', 'were', 'has', 'have', 'had', 'will', 'our', 'us',
]);
/**
 * FNV-1a 32-bit string hash. Deterministic and fast; used to map tokens/grams
 * into embedding buckets. `Math.imul` keeps the multiply in 32-bit space.
 */
function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
/** Tokenize free text into lowercased, de-stopworded terms of length ≥ 2. */
function embedTokens(text) {
    return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 2 && !EMBED_STOPWORDS.has(t));
}
/** L2-normalize a vector in place-free fashion. A zero vector is returned as-is. */
function l2normalize(vec) {
    let norm = 0;
    for (const x of vec)
        norm += x * x;
    norm = Math.sqrt(norm);
    if (norm === 0)
        return vec.slice();
    return vec.map((x) => x / norm);
}
/**
 * Deterministic local embedding of `text` into a fixed-dim, L2-normalized
 * vector. Combines three lexical signals hashed into the same space:
 *   - whole word tokens (weight 1.0)
 *   - word bigrams (weight 0.75) — a little phrase sense
 *   - padded character trigrams (weight 0.5) — sub-word / morphological overlap
 * Pure: no randomness, no I/O. Returns a zero vector for empty/stopword-only
 * input (cosine with anything is then 0, which is correct).
 */
function embedText(text, dim = exports.DEFAULT_EMBED_DIM) {
    const vec = new Array(dim).fill(0);
    const tokens = embedTokens(text);
    for (const tok of tokens) {
        vec[fnv1a(tok) % dim] += 1;
        const padded = `#${tok}#`;
        for (let i = 0; i + 3 <= padded.length; i++) {
            vec[fnv1a(`3:${padded.slice(i, i + 3)}`) % dim] += 0.5;
        }
    }
    for (let i = 0; i + 1 < tokens.length; i++) {
        vec[fnv1a(`bi:${tokens[i]}_${tokens[i + 1]}`) % dim] += 0.75;
    }
    return l2normalize(vec);
}
/**
 * Cosine similarity of two vectors. When both are L2-normalized (as everything
 * stored here is) this is just the dot product. Guards against length
 * mismatches by comparing only the shared prefix — but callers should prefer
 * to skip mismatched-dim rows entirely (see retrieval).
 */
function cosineSimilarity(a, b) {
    const n = Math.min(a.length, b.length);
    let dot = 0;
    for (let i = 0; i < n; i++)
        dot += a[i] * b[i];
    return dot;
}
/**
 * Stable content hash for skip-unchanged re-indexing. Uses FNV-1a over the
 * normalized text, hex-encoded and prefixed with the length to make accidental
 * collisions astronomically unlikely for our purposes. Pure + no crypto import.
 */
function contentHash(text) {
    const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
    return `${normalized.length.toString(16)}:${fnv1a(normalized).toString(16)}`;
}
//# sourceMappingURL=embedding.js.map