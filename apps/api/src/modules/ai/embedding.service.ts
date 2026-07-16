import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DEFAULT_EMBED_DIM, embedText, l2normalize } from './embedding'

/** An embedded piece of text: its L2-normalized vector and that vector's length. */
export type Embedding = { vector: number[]; dim: number }

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
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name)
  private readonly apiKey?: string
  private readonly model: string
  private readonly localDim: number

  constructor(private readonly config: ConfigService) {
    this.apiKey =
      config.get<string>('EMBEDDINGS_API_KEY') ?? config.get<string>('OPENAI_API_KEY') ?? undefined
    this.model = config.get<string>('EMBEDDINGS_MODEL') ?? 'text-embedding-3-small'
    const dim = Number(config.get<string>('EMBEDDINGS_LOCAL_DIM'))
    this.localDim = Number.isFinite(dim) && dim >= 32 ? Math.trunc(dim) : DEFAULT_EMBED_DIM
  }

  /** True when a real embeddings API is configured (env-gated). */
  usesApi(): boolean {
    return Boolean(this.apiKey)
  }

  /** The dimensionality of vectors produced by the local (default) embedder. */
  get dim(): number {
    return this.localDim
  }

  /** Embed a single piece of text into an L2-normalized vector. */
  async embed(text: string): Promise<Embedding> {
    const trimmed = (text ?? '').trim()
    if (this.apiKey) {
      const vector = await this.embedViaApi([trimmed])
      return { vector: vector[0], dim: vector[0].length }
    }
    const vector = embedText(trimmed, this.localDim)
    return { vector, dim: this.localDim }
  }

  /**
   * Embed a batch of texts. Uses one API request for the whole batch when the
   * API path is active; otherwise maps the pure local embedder. Order-preserving.
   */
  async embedBatch(texts: string[]): Promise<Embedding[]> {
    if (texts.length === 0) return []
    if (this.apiKey) {
      const vectors = await this.embedViaApi(texts.map((t) => (t ?? '').trim()))
      return vectors.map((v) => ({ vector: v, dim: v.length }))
    }
    return texts.map((t) => ({ vector: embedText((t ?? '').trim(), this.localDim), dim: this.localDim }))
  }

  /**
   * Call the OpenAI-compatible embeddings endpoint and return L2-normalized
   * vectors. Env-gated (only reached when a key is set). Throws on failure so
   * callers never silently mix API vectors with local ones (which would have a
   * different dimension) — the indexer/retrieval degrade gracefully instead.
   */
  private async embedViaApi(inputs: string[]): Promise<number[][]> {
    const base = this.config.get<string>('EMBEDDINGS_API_URL') ?? 'https://api.openai.com/v1/embeddings'
    const res = await fetch(base, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: inputs }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Embeddings API ${res.status}: ${detail.slice(0, 200)}`)
    }
    const json = (await res.json()) as { data?: Array<{ embedding: number[]; index?: number }> }
    const data = json.data ?? []
    // Preserve request order even if the API returns an `index` field.
    const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    return ordered.map((d) => l2normalize(d.embedding))
  }
}
