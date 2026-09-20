"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EmbeddingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const embedding_1 = require("./embedding");
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
let EmbeddingService = EmbeddingService_1 = class EmbeddingService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(EmbeddingService_1.name);
        this.apiKey =
            config.get('EMBEDDINGS_API_KEY') ?? config.get('OPENAI_API_KEY') ?? undefined;
        this.model = config.get('EMBEDDINGS_MODEL') ?? 'text-embedding-3-small';
        const dim = Number(config.get('EMBEDDINGS_LOCAL_DIM'));
        this.localDim = Number.isFinite(dim) && dim >= 32 ? Math.trunc(dim) : embedding_1.DEFAULT_EMBED_DIM;
    }
    /** True when a real embeddings API is configured (env-gated). */
    usesApi() {
        return Boolean(this.apiKey);
    }
    /** The dimensionality of vectors produced by the local (default) embedder. */
    get dim() {
        return this.localDim;
    }
    /** Embed a single piece of text into an L2-normalized vector. */
    async embed(text) {
        const trimmed = (text ?? '').trim();
        if (this.apiKey) {
            const vector = await this.embedViaApi([trimmed]);
            return { vector: vector[0], dim: vector[0].length };
        }
        const vector = (0, embedding_1.embedText)(trimmed, this.localDim);
        return { vector, dim: this.localDim };
    }
    /**
     * Embed a batch of texts. Uses one API request for the whole batch when the
     * API path is active; otherwise maps the pure local embedder. Order-preserving.
     */
    async embedBatch(texts) {
        if (texts.length === 0)
            return [];
        if (this.apiKey) {
            const vectors = await this.embedViaApi(texts.map((t) => (t ?? '').trim()));
            return vectors.map((v) => ({ vector: v, dim: v.length }));
        }
        return texts.map((t) => ({ vector: (0, embedding_1.embedText)((t ?? '').trim(), this.localDim), dim: this.localDim }));
    }
    /**
     * Call the OpenAI-compatible embeddings endpoint and return L2-normalized
     * vectors. Env-gated (only reached when a key is set). Throws on failure so
     * callers never silently mix API vectors with local ones (which would have a
     * different dimension) — the indexer/retrieval degrade gracefully instead.
     */
    async embedViaApi(inputs) {
        const base = this.config.get('EMBEDDINGS_API_URL') ?? 'https://api.openai.com/v1/embeddings';
        const res = await fetch(base, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({ model: this.model, input: inputs }),
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Embeddings API ${res.status}: ${detail.slice(0, 200)}`);
        }
        const json = (await res.json());
        const data = json.data ?? [];
        // Preserve request order even if the API returns an `index` field.
        const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        return ordered.map((d) => (0, embedding_1.l2normalize)(d.embedding));
    }
};
exports.EmbeddingService = EmbeddingService;
exports.EmbeddingService = EmbeddingService = EmbeddingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmbeddingService);
//# sourceMappingURL=embedding.service.js.map