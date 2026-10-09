/**
 * IMAGES MADE FROM A PROMPT (`ledger-rows/row-870`, and the "Images generated"
 * tile of `commit-log/log-39863ff-1`).
 *
 * ClickUp's AI makes images from a task's comment box or a Chat message — the
 * AI button, then a description — up to ten for one prompt (its help centre,
 * "Generate images with Brain AI", through search excerpts, 8 October). The
 * only model client here is Anthropic's, which makes no images, so this is a
 * second provider: OpenAI's images API at IMAGES_API_URL (OpenAI's own address
 * unless one is given) with IMAGES_API_KEY, falling back to OPENAI_API_KEY, and
 * the model IMAGES_MODEL (`gpt-image-1` unless one is given). Its own variables,
 * not OPENAI_API_URL: the embeddings read OPENAI_API_KEY too, and a lane that
 * pointed it at the images stub would send them there. With no key, image
 * generation is not set up, and the composer says so.
 *
 * The lanes and CI ask `scripts/e2e-lanes/media-stub.mjs`, which answers in
 * OpenAI's shape. Plain functions over a base address, so `check-media-stub.mjs`
 * drives exactly what the API calls.
 */

export type ImagesConfig = { base: string; key: string; model: string }

/** At most this many pictures for one prompt here; ClickUp's own ceiling is ten, and a comment carries a few. */
export const IMAGES_PER_ASK = 4
export const IMAGE_PROMPT_MAX = 1000
/** The shapes the composer offers: square, landscape, portrait. */
export const IMAGE_SIZES = ['1024x1024', '1536x1024', '1024x1536'] as const
export type ImageSize = (typeof IMAGE_SIZES)[number]

/** Not set up: no key on this server. */
export class ImagesUnset extends Error {}
/** The provider answered with a refusal or not at all; `status` is its own, 0 when nothing came back. */
export class ImagesFailed extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export function imagesConfig(env: Record<string, string | undefined> = process.env): ImagesConfig | null {
  const key = (env.IMAGES_API_KEY?.trim() || env.OPENAI_API_KEY?.trim()) ?? ''
  if (!key) return null
  const base = (env.IMAGES_API_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = env.IMAGES_MODEL?.trim() || 'gpt-image-1'
  return { base, key, model }
}

export type MadeImage = { mime: 'image/png'; b64: string }

/** A picture's file name: the prompt's first words, then its place in the answer — `a-lighthouse-at-dusk-2.png`. */
export function imageFileName(prompt: string, index: number): string {
  const words = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '')
  return `${words || 'image'}-${index + 1}.png`
}

/** `count` pictures of `prompt`, as PNGs. */
export async function generateImages(cfg: ImagesConfig, prompt: string, count: number, size: ImageSize, timeoutMs = 120_000): Promise<MadeImage[]> {
  let res: Response
  try {
    res = await fetch(`${cfg.base}/images/generations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, prompt, n: count, size }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new ImagesFailed(0, 'The image service did not answer')
  }
  const body = (await res.json().catch(() => null)) as { data?: { b64_json?: string }[]; error?: { message?: string } } | null
  if (!res.ok) throw new ImagesFailed(res.status, body?.error?.message ?? `The image service refused the request (${res.status})`)
  const images = (body?.data ?? [])
    .map((d) => d.b64_json)
    .filter((b): b is string => typeof b === 'string' && b.length > 0)
    .map((b64) => ({ mime: 'image/png' as const, b64 }))
  if (images.length === 0) throw new ImagesFailed(res.status, 'The image service answered with no pictures')
  return images
}
