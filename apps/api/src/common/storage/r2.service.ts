import { Readable } from 'node:stream'
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name)
  private readonly bucketName: string | null
  private readonly publicUrl: string | null
  private readonly endpoint: string | null
  private readonly client: S3Client | null

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID')
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID')
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY')
    const bucketName = this.config.get<string>('R2_BUCKET_NAME')
    const endpoint = this.config.get<string>('R2_ENDPOINT') ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined)
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL') ?? null
    this.bucketName = bucketName ?? null
    this.endpoint = endpoint ?? null

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
      this.client = null
      this.logger.warn('R2 is not fully configured. File and clip uploads are disabled.')
      return
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    })
  }

  get configured(): boolean {
    return !!this.client && !!this.bucketName
  }

  private requireConfigured() {
    if (!this.client || !this.bucketName) {
      throw new InternalServerErrorException('Storage is not configured')
    }
  }

  async presignPutObject(
    key: string,
    contentType: string,
    metadata: Record<string, string> = {},
    expiresInSeconds = 900,
  ): Promise<string> {
    this.requireConfigured()
    const cmd = new PutObjectCommand({
      Bucket: this.bucketName!,
      Key: key,
      ContentType: contentType,
      Metadata: metadata,
    })
    return getSignedUrl(this.client!, cmd, { expiresIn: expiresInSeconds })
  }

  /**
   * Direct server-side upload — used when we can't go through a presigned
   * URL (e.g. attachments arriving via the inbound-email webhook are
   * pre-decoded by the email provider, so the API has the bytes in hand).
   */
  async putObject(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
    metadata: Record<string, string> = {},
  ): Promise<void> {
    this.requireConfigured()
    await this.client!.send(
      new PutObjectCommand({
        Bucket: this.bucketName!,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      }),
    )
  }

  /**
   * Fetch an object's raw bytes server-side. Used when the API needs the
   * content itself (not a browser download URL) — e.g. the §15.1 knowledge
   * indexer extracting text from a text attachment. Returns a Buffer; callers
   * decide how to decode. Throws if storage is unconfigured or the key is
   * missing (callers that must not fail wrap this in try/catch).
   */
  async getObject(key: string): Promise<Buffer> {
    this.requireConfigured()
    const res = await this.client!.send(new GetObjectCommand({ Bucket: this.bucketName!, Key: key }))
    const body = res.Body
    if (!body) return Buffer.alloc(0)
    // AWS SDK v3 streams expose transformToByteArray() in Node and browsers.
    const bytes = await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray()
    return Buffer.from(bytes)
  }

  /**
   * An object's bytes as a stream, for a caller that passes them on rather
   * than reading them: a task's files, zipped as they arrive
   * (`found-30-sep/attachments-have-no-download-all`). The same object the
   * Download link's signed URL names — the bucket and the key — read with the
   * API's own credentials instead of a signature. Throws as `getObject` does:
   * `NoSuchKey` when nothing is there. Whoever takes the stream reads it to
   * the end or destroys it, or the connection to the store stays open.
   */
  async getObjectStream(key: string): Promise<Readable> {
    this.requireConfigured()
    const res = await this.client!.send(new GetObjectCommand({ Bucket: this.bucketName!, Key: key }))
    // In Node the SDK's body IS a Readable (an IncomingMessage with helpers mixed in).
    return (res.Body as Readable | undefined) ?? Readable.from([])
  }

  async getObjectUrl(key: string, expiresInSeconds = 900): Promise<string> {
    this.requireConfigured()
    if (this.publicUrl) {
      const normalized = this.publicUrl.replace(/\/$/, '')
      // Only use direct public URL mode for true public/CDN domains.
      // Raw R2 S3 endpoints usually require signed requests and can return 400/403 on browser GET.
      const looksLikeRawR2Api = /r2\.cloudflarestorage\.com/i.test(normalized)
      if (!looksLikeRawR2Api) {
        return `${normalized}/${key}`
      }
    }
    const cmd = new GetObjectCommand({ Bucket: this.bucketName!, Key: key })
    return getSignedUrl(this.client!, cmd, { expiresIn: expiresInSeconds })
  }

  /**
   * The key behind a URL this service hands out, or null when the URL is not
   * one of ours — for a caller that must not store a URL of our own bucket in
   * place of the key it was made from.
   *
   * WHY IT EXISTS. `getObjectUrl` signs for fifteen minutes. A screen that
   * loads a signed URL into a form and sends the form back writes that URL
   * into a column meant for the durable key, and the link dies a quarter of an
   * hour later — the AI page's meeting card did exactly that on every Update.
   * Both shapes are recognised: `${R2_PUBLIC_URL}/<key>` and the path-style
   * presigned `${endpoint}/<bucket>/<key>?X-Amz-…`.
   */
  keyFromOwnUrl(url: string): string | null {
    if (!this.configured) return null
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return null
    }
    const underPath = (base: string) => {
      const b = new URL(base.endsWith('/') ? base : `${base}/`)
      if (parsed.origin !== b.origin || !parsed.pathname.startsWith(b.pathname)) return null
      const rest = parsed.pathname.slice(b.pathname.length)
      try {
        return decodeURIComponent(rest) || null
      } catch {
        return null
      }
    }
    if (this.publicUrl) {
      const key = underPath(this.publicUrl)
      if (key !== null) return key
    }
    if (this.endpoint && this.bucketName) return underPath(`${this.endpoint.replace(/\/$/, '')}/${this.bucketName}`)
    return null
  }

  async deleteObject(key: string): Promise<void> {
    this.requireConfigured()
    await this.client!.send(new DeleteObjectCommand({ Bucket: this.bucketName!, Key: key }))
  }

  /**
   * A copy made INSIDE the bucket; the bytes never pass through the API. For
   * an object that has to become somebody else's own: a clip attached to a
   * task gets a copy under the task's prefix, so deleting either one leaves
   * the other where it was.
   *
   * `REPLACE`, not the default `COPY`, for the metadata: the copy describes
   * its new owner (who put it there, which task it is on), as an upload to
   * that prefix would, and not the object it was copied from.
   */
  async copyObject(
    sourceKey: string,
    destinationKey: string,
    opts: { contentType: string; metadata?: Record<string, string> },
  ): Promise<void> {
    this.requireConfigured()
    await this.client!.send(
      new CopyObjectCommand({
        Bucket: this.bucketName!,
        Key: destinationKey,
        // `bucket/key`, URL-encoded, which is the header's defined form.
        CopySource: encodeURI(`${this.bucketName}/${sourceKey}`),
        MetadataDirective: 'REPLACE',
        ContentType: opts.contentType,
        Metadata: opts.metadata ?? {},
      }),
    )
  }

  async headObject(key: string) {
    this.requireConfigured()
    return this.client!.send(new HeadObjectCommand({ Bucket: this.bucketName!, Key: key }))
  }

  /**
   * EVERY object under a prefix, in key order. A listing answers one page, of
   * `pageSize` at most (1000 is the most S3 gives), and says when it stopped
   * short. Reading one page and trusting it is how the clip library came to
   * show a workspace's 200 OLDEST clips, since clip keys start with the moment
   * they were made (`found-23-sep/clip-library-lists-the-oldest-200`). A
   * continuation token that comes round again ends the walk instead of looping.
   */
  async listAllObjects(prefix: string, pageSize = 1000) {
    this.requireConfigured()
    const all: NonNullable<ListObjectsV2CommandOutput['Contents']> = []
    const seen = new Set<string>()
    let token: string | undefined
    for (;;) {
      const page = await this.client!.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName!,
          Prefix: prefix,
          MaxKeys: pageSize,
          ContinuationToken: token,
        }),
      )
      all.push(...(page.Contents ?? []))
      const next = page.IsTruncated ? page.NextContinuationToken : undefined
      if (!next || seen.has(next)) return all
      seen.add(next)
      token = next
    }
  }
}

