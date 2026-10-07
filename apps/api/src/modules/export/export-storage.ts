import { createHmac, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import type { R2Service } from '../../common/storage/r2.service'

/**
 * Where a finished export waits to be downloaded: R2 when it is configured, a
 * folder on the API's own disk when it is not (local development). Either way
 * it is handed out only through a SIGNED link that expires (§5.1: "Download
 * links expire after one hour"), so an emailed link works in a browser with no
 * session, and only until it expires.
 */
export class ExportStorage {
  constructor(
    private readonly r2: R2Service,
    private readonly secret: string,
    private readonly localDir = process.env.EXPORT_LOCAL_DIR || join(tmpdir(), 'rundesk-exports'),
  ) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.r2.configured) {
      await this.r2.putObject(key, body, contentType)
      return
    }
    const path = this.localPath(key)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, body)
  }

  async open(key: string): Promise<Readable> {
    if (this.r2.configured) return this.r2.getObjectStream(key)
    return createReadStream(this.localPath(key))
  }

  async remove(key: string): Promise<void> {
    if (this.r2.configured) await this.r2.deleteObject(key).catch(() => undefined)
    else await rm(this.localPath(key), { force: true })
  }

  /** Local files older than `maxAgeMs` (R2 objects are removed by key, by the caller). */
  async purgeLocal(maxAgeMs: number): Promise<void> {
    if (this.r2.configured) return
    const dirs = await readdir(this.localDir).catch(() => [] as string[])
    for (const d of dirs) {
      const full = join(this.localDir, d)
      const info = await stat(full).catch(() => null)
      if (info && Date.now() - info.mtimeMs > maxAgeMs) await rm(full, { recursive: true, force: true })
    }
  }

  private localPath(key: string): string {
    // Keys are made by this module (`exports/<workspace>/<export>.csv`); nothing may climb out.
    const safe = key.replace(/\.\.+/g, '').replace(/^\/+/, '')
    return join(this.localDir, safe.replace(/^exports\//, ''))
  }

  /** `expires` (ms) and an HMAC over the export id and it. */
  sign(exportId: string, expires: number): string {
    return createHmac('sha256', this.secret).update(`${exportId}.${expires}`).digest('base64url')
  }

  verify(exportId: string, expires: number, signature: string): boolean {
    if (!Number.isFinite(expires) || expires < Date.now()) return false
    const expected = Buffer.from(this.sign(exportId, expires))
    const given = Buffer.from(String(signature))
    return expected.length === given.length && timingSafeEqual(expected, given)
  }
}
