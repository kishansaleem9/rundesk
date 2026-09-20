"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const embedding_1 = require("./embedding");
/**
 * §15.1 deterministic local embedder. This is the tested default path — a pure,
 * offline, hashed bag-of-words + char-trigram embedder. We assert it is
 * reproducible, normalized, dimension-stable, and produces genuine cosine
 * similarity (similar texts closer than dissimilar ones).
 */
const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
(0, node_test_1.describe)('embedText — deterministic + normalized (§15.1)', () => {
    (0, node_test_1.it)('is pure: identical text always yields the identical vector', () => {
        const a = (0, embedding_1.embedText)('Ship the mobile launch by Friday');
        const b = (0, embedding_1.embedText)('Ship the mobile launch by Friday');
        strict_1.default.deepEqual(a, b);
    });
    (0, node_test_1.it)('produces a fixed-dimension vector (default 256)', () => {
        strict_1.default.equal((0, embedding_1.embedText)('anything at all').length, embedding_1.DEFAULT_EMBED_DIM);
        strict_1.default.equal((0, embedding_1.embedText)('anything at all', 128).length, 128);
    });
    (0, node_test_1.it)('returns an L2-normalized (unit-length) vector for non-empty text', () => {
        const v = (0, embedding_1.embedText)('quarterly planning roadmap review');
        strict_1.default.ok(Math.abs(norm(v) - 1) < 1e-9, `expected unit norm, got ${norm(v)}`);
    });
    (0, node_test_1.it)('returns a zero vector for empty / stopword-only input', () => {
        strict_1.default.equal(norm((0, embedding_1.embedText)('')), 0);
        strict_1.default.equal(norm((0, embedding_1.embedText)('the a an of to')), 0);
    });
    (0, node_test_1.it)('a vector has cosine 1 with itself', () => {
        const v = (0, embedding_1.embedText)('launch the new pricing page');
        strict_1.default.ok(Math.abs((0, embedding_1.cosineSimilarity)(v, v) - 1) < 1e-9);
    });
});
(0, node_test_1.describe)('cosineSimilarity — semantic ranking (§15.1)', () => {
    (0, node_test_1.it)('scores similar texts higher than dissimilar texts', () => {
        const query = (0, embedding_1.embedText)('when is the mobile app launch');
        const close = (0, embedding_1.embedText)('mobile app launch is scheduled for next week');
        const far = (0, embedding_1.embedText)('accounting invoices and payroll taxes');
        const sClose = (0, embedding_1.cosineSimilarity)(query, close);
        const sFar = (0, embedding_1.cosineSimilarity)(query, far);
        strict_1.default.ok(sClose > sFar, `expected close(${sClose}) > far(${sFar})`);
        strict_1.default.ok(sClose > 0, 'a topically-related text has positive similarity');
    });
    (0, node_test_1.it)('captures sub-word (morphological) overlap via char trigrams', () => {
        // No shared whole word beyond the stem, but "launch"/"launching" share
        // trigrams, so similarity is positive (bag-of-exact-words would be 0).
        const s = (0, embedding_1.cosineSimilarity)((0, embedding_1.embedText)('product launch'), (0, embedding_1.embedText)('we are launching the product'));
        strict_1.default.ok(s > 0, `expected positive sub-word similarity, got ${s}`);
    });
    (0, node_test_1.it)('is symmetric', () => {
        const a = (0, embedding_1.embedText)('sprint retrospective notes');
        const b = (0, embedding_1.embedText)('notes from the sprint review');
        strict_1.default.ok(Math.abs((0, embedding_1.cosineSimilarity)(a, b) - (0, embedding_1.cosineSimilarity)(b, a)) < 1e-12);
    });
});
(0, node_test_1.describe)('l2normalize / embedTokens (§15.1 helpers)', () => {
    (0, node_test_1.it)('normalizes to unit length and leaves a zero vector untouched', () => {
        strict_1.default.ok(Math.abs(norm((0, embedding_1.l2normalize)([3, 4])) - 1) < 1e-9);
        strict_1.default.deepEqual((0, embedding_1.l2normalize)([0, 0, 0]), [0, 0, 0]);
    });
    (0, node_test_1.it)('tokenizes to lowercased content terms, dropping stopwords and short tokens', () => {
        strict_1.default.deepEqual((0, embedding_1.embedTokens)('The Quick launch of X'), ['quick', 'launch']);
    });
});
(0, node_test_1.describe)('contentHash — stable skip-unchanged key (§15.1)', () => {
    (0, node_test_1.it)('is stable for identical (whitespace-normalized) content', () => {
        strict_1.default.equal((0, embedding_1.contentHash)('hello   world'), (0, embedding_1.contentHash)(' hello world '));
    });
    (0, node_test_1.it)('differs when the content differs', () => {
        strict_1.default.notEqual((0, embedding_1.contentHash)('hello world'), (0, embedding_1.contentHash)('hello worlds'));
    });
});
//# sourceMappingURL=embedding.test.js.map