import { zipStream } from '../export/zip-stream'

/**
 * An archive written by the one zip writer (`zip-stream.ts`, which `unzip`
 * reads back in its own test), for the importers' tests to read: a workbook,
 * a Word document, a Confluence or Slack export, made of the parts a test
 * names. Like `r2-test-store.ts`, for tests only.
 */
export async function zipOf(entries: Record<string, string | Buffer>, method: 'store' | 'deflate' = 'deflate'): Promise<Buffer> {
  const chunks: Buffer[] = []
  const list = Object.entries(entries).map(([name, body]) => ({
    name,
    method,
    open: async () => (typeof body === 'string' ? Buffer.from(body, 'utf8') : body),
  }))
  for await (const chunk of zipStream(list)) chunks.push(chunk)
  return Buffer.concat(chunks)
}
