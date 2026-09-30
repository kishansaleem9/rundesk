import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { Injectable, InternalServerErrorException, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
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
import { isPublicImageKey, isUnderPublicImagePrefix, PUBLIC_IMAGE_PREFIXES } from './object-key-shape'

/**
 * What `R2_PUBLIC_URL` was last seen to serve (`checkPublicDomain`):
 * - `unchecked`: nothing asked yet, or there is no public domain to ask;
 * - `private-kept`: an object put among the private ones is NOT readable there;
 * - `serves-private`: it is — the domain serves `R2_BUCKET_NAME` to anybody;
 * - `unknown`: the question got no answer (the store or the domain did not reply).
 */
export type PublicDomainState = 'unchecked' | 'private-kept' | 'serves-private' | 'unknown'

/** Where the check's object is put: under no prefix the product lists, reads or serves. */
export const PUBLIC_DOMAIN_PROBE_PREFIX = 'rundesk-probe/public-domain-'
/** How long each step of the check may take: the put, and the unsigned read. */
const PUBLIC_DOMAIN_PROBE_TIMEOUT_MS = 5_000

@Injectable()
export class R2Service implements OnApplicationBootstrap {
  private readonly logger = new Logger(R2Service.name)
  private readonly bucketName: string | null
  /**
   * The pictures' own bucket (`R2_PUBLIC_BUCKET_NAME`), when it is set and is
   * not `R2_BUCKET_NAME`; else null, and the pictures live among the private
   * objects. See `publicObjectUrl`.
   */
  private readonly publicBucketName: string | null
  private readonly publicUrl: string | null
  private readonly endpoint: string | null
  private readonly client: S3Client | null
  private publicDomain: PublicDomainState = 'unchecked'

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID')
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID')
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY')
    const bucketName = this.config.get<string>('R2_BUCKET_NAME')
    const endpoint = this.config.get<string>('R2_ENDPOINT') ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined)
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL') ?? null
    this.bucketName = bucketName ?? null
    this.endpoint = endpoint ?? null
    const publicBucketName = this.config.get<string>('R2_PUBLIC_BUCKET_NAME') || null
    this.publicBucketName = publicBucketName && publicBucketName !== bucketName ? publicBucketName : null
    if (publicBucketName && !this.publicBucketName) {
      this.logger.warn('R2_PUBLIC_BUCKET_NAME names R2_BUCKET_NAME itself, so the pictures have no bucket of their own: it is ignored.')
    }

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

  /**
   * THE BUCKET AN OBJECT IS IN. The pictures on show — a key of a picture's
   * shape (`isPublicImageKey`), one safe segment directly under `avatars/` or
   * `workspace-logos/` — are in `R2_PUBLIC_BUCKET_NAME` where that is set, and
   * everything else is in `R2_BUCKET_NAME`, which no public domain needs to
   * serve (`found-30-sep/public-cdn-url-makes-every-object-public`). By the
   * shape, not the prefix: nothing but a picture is ever written where a
   * domain serves it, however its key is spelt. Every call below that names a
   * key asks this, so an upload, a read, a signature and a delete all land on
   * the same bucket.
   */
  private bucketFor(key: string): string {
    return this.publicBucketName && isPublicImageKey(key) ? this.publicBucketName : this.bucketName!
  }

  /**
   * The buckets a picture may be FOUND in: its own, and the private one too,
   * where every picture was kept before the pictures had a bucket of their own
   * and where one not yet moved still is (`movePicturesToPublicBucket`). A
   * listing under a picture prefix reads both and a picture's delete clears
   * both, so a workspace deleted for good leaves no logo behind in either.
   */
  private bucketsHolding(key: string): string[] {
    const own = this.bucketFor(key)
    return own === this.bucketName ? [own] : [own, this.bucketName!]
  }

  /** And the buckets a listing under `prefix` reads: both, for a prefix that may hold pictures. */
  private bucketsListing(prefix: string): string[] {
    return this.publicBucketName && isUnderPublicImagePrefix(prefix) ? [this.publicBucketName, this.bucketName!] : [this.bucketName!]
  }

  async presignPutObject(
    key: string,
    contentType: string,
    metadata: Record<string, string> = {},
    expiresInSeconds = 900,
  ): Promise<string> {
    this.requireConfigured()
    const cmd = new PutObjectCommand({
      Bucket: this.bucketFor(key),
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
        Bucket: this.bucketFor(key),
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
    const res = await this.client!.send(new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key }))
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
    const res = await this.client!.send(new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key }))
    // In Node the SDK's body IS a Readable (an IncomingMessage with helpers mixed in).
    return (res.Body as Readable | undefined) ?? Readable.from([])
  }

  /**
   * A SIGNED URL FOR ONE OBJECT, good for `expiresInSeconds` — WHATEVER
   * `R2_PUBLIC_URL` SAYS (`found-30-sep/public-cdn-url-makes-every-object-public`).
   *
   * Every caller hands this to somebody a read rule let through: a task's
   * files and cover, a clip, a call's recording, a chat file, an emoji, a
   * form's upload. This answered `${R2_PUBLIC_URL}/<key>` whenever that was
   * not the raw R2 API host, so where it was a CDN domain each of those was at
   * a permanent address that anybody once handed it could keep — a member
   * since removed, a guest no longer shared with, whoever a link was forwarded
   * to — and the address is the key, `<prefix>/<milliseconds>-<name>`, which
   * is not a secret. A custom domain connected to an R2 bucket makes the whole
   * bucket public, so a signature is the only rule the store itself keeps.
   *
   * ClickUp: "The Private Attachment Links setting requires that the person
   * accessing a Workspace attachment is logged into that Workspace" (help
   * centre, through search excerpts). Rundesk has no setting that makes an
   * attachment public, so private content is signed, always. The pictures on
   * show are the one public kind: `publicObjectUrl`.
   */
  async getObjectUrl(key: string, expiresInSeconds = 900): Promise<string> {
    this.requireConfigured()
    const cmd = new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key })
    return getSignedUrl(this.client!, cmd, { expiresIn: expiresInSeconds })
  }

  /**
   * Where a PICTURE ON SHOW is served from — an avatar or a workspace logo,
   * public by design (a logo is drawn on a custom domain's sign-in page, before
   * anybody signs in). `${R2_PUBLIC_URL}/<key>`, so a CDN serves and caches it,
   * only where all of these hold; signed like any object otherwise:
   *
   * - the key is a picture's (`isPublicImageKey`): one safe segment directly
   *   under `avatars/` or `workspace-logos/`, so a caller that asks this of an
   *   attachment still hands out no permanent address;
   * - `R2_PUBLIC_URL` is a public domain, not the raw R2 API host, which
   *   answers an unsigned GET with 400 or 403;
   * - THE PICTURES HAVE A BUCKET OF THEIR OWN (`R2_PUBLIC_BUCKET_NAME`). A
   *   custom domain connected to an R2 bucket serves EVERY key in it, and the
   *   key of a private object is in the path of every signed URL for it, so a
   *   domain on `R2_BUCKET_NAME` let anybody once handed a task's file read it
   *   there for as long as it lived — and sending a viewer to a picture there
   *   told everybody where the domain was
   *   (`found-30-sep/public-cdn-url-makes-every-object-public`);
   * - and the domain was last seen NOT to serve the private bucket
   *   (`checkPublicDomain`), since a domain left connected to it, or connected
   *   to it later, would serve every private object whatever this hands out.
   */
  async publicObjectUrl(key: string, expiresInSeconds = 900): Promise<string> {
    this.requireConfigured()
    const base = this.publicBase()
    if (base && this.publicBucketName && this.publicDomain === 'private-kept' && isPublicImageKey(key)) {
      return `${base}/${key}`
    }
    return this.getObjectUrl(key, expiresInSeconds)
  }

  /** `R2_PUBLIC_URL` without its trailing slash, when it is a public domain rather than the raw R2 API host; else null. */
  private publicBase(): string | null {
    if (!this.publicUrl) return null
    const normalized = this.publicUrl.replace(/\/$/, '')
    return /r2\.cloudflarestorage\.com/i.test(normalized) ? null : normalized
  }

  /** What `R2_PUBLIC_URL` was last seen to serve (see `PublicDomainState`). */
  get publicDomainState(): PublicDomainState {
    return this.publicDomain
  }

  /**
   * On boot, before the first request: whether the public domain serves the
   * private bucket, so no picture is sent to one that does; and the pictures
   * kept among the private objects are moved to their own bucket, after it
   * (they are served signed until they are).
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.checkPublicDomain()
    void this.movePicturesToPublicBucket().catch((err: unknown) => {
      this.logger.error(`Moving the pictures to R2_PUBLIC_BUCKET_NAME stopped: ${err instanceof Error ? err.message : String(err)}`)
    })
  }

  /** And every hour after: a domain can be connected to the private bucket while the API runs. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'r2-public-domain-check' })
  async recheckPublicDomain(): Promise<void> {
    await this.checkPublicDomain()
  }

  /**
   * DOES `R2_PUBLIC_URL` SERVE THE PRIVATE BUCKET? Asked, not assumed: an
   * object is put in `R2_BUCKET_NAME` under a key no feature uses
   * (`PUBLIC_DOMAIN_PROBE_PREFIX`), with a random body, and read back from the
   * domain with no signature. The body coming back means the domain serves
   * `R2_BUCKET_NAME` — every task file, clip, recording and chat file there,
   * to anybody who has its key — and the API then sends no picture to it and
   * says so, as an error, at every check until it stops. Anything else (a 404,
   * a 403 from a rule on the domain, a sign-in page) means it keeps them. No
   * answer is `unknown`, and pictures are signed until one comes.
   *
   * What code cannot do is disconnect the domain: the error says who must.
   * Cloudflare: "When you connect a Custom Domain, your R2 bucket becomes
   * publicly accessible."
   */
  async checkPublicDomain(fetchImpl: typeof fetch = fetch): Promise<PublicDomainState> {
    const base = this.publicBase()
    if (!base || !this.client || !this.bucketName) return this.publicDomain
    const key = `${PUBLIC_DOMAIN_PROBE_PREFIX}${randomBytes(12).toString('hex')}.txt`
    const token = randomBytes(24).toString('hex')
    let state: PublicDomainState
    let why = ''
    let put = false
    try {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucketName, Key: key, Body: token, ContentType: 'text/plain' }),
        { abortSignal: AbortSignal.timeout(PUBLIC_DOMAIN_PROBE_TIMEOUT_MS) },
      )
      put = true
      const res = await fetchImpl(`${base}/${key}`, { signal: AbortSignal.timeout(PUBLIC_DOMAIN_PROBE_TIMEOUT_MS) })
      const body = res.ok ? await res.text() : await res.body?.cancel().then(() => '', () => '') ?? ''
      state = res.ok && body.trim() === token ? 'serves-private' : 'private-kept'
      why = `answered ${res.status}`
    } catch (err) {
      state = 'unknown'
      why = err instanceof Error ? err.message : String(err)
    } finally {
      if (put) {
        await this.client
          .send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }))
          .catch((err: unknown) => this.logger.warn(`The public-domain check left ${key} behind: ${err instanceof Error ? err.message : String(err)}`))
      }
    }
    const was = this.publicDomain
    this.publicDomain = state
    const bucket = this.bucketName
    if (state === 'serves-private') {
      this.logger.error(
        `R2_PUBLIC_URL (${base}) serves the objects of R2_BUCKET_NAME (${bucket}) to anybody, unsigned: ` +
          `every task file, clip, recording and chat file there is readable by its key, whatever the API hands out. ` +
          `Disconnect that domain from ${bucket}. The API sends nobody to it: pictures are signed.` +
          (this.publicBucketName
            ? ` Connect the domain to R2_PUBLIC_BUCKET_NAME (${this.publicBucketName}) alone.`
            : ` To serve avatars and logos from a public domain, set R2_PUBLIC_BUCKET_NAME to a bucket of their own and connect the domain to that bucket alone.`),
      )
    } else if (state === 'unknown') {
      this.logger.warn(`Could not check whether R2_PUBLIC_URL (${base}) serves the objects of R2_BUCKET_NAME (${bucket}): ${why}. Pictures are signed until it can be checked.`)
    } else if (was !== state) {
      if (this.publicBucketName) {
        this.logger.log(`Avatars and workspace logos are served from R2_PUBLIC_URL (${base}), the domain of R2_PUBLIC_BUCKET_NAME (${this.publicBucketName}); it serves no object of R2_BUCKET_NAME (${why}).`)
      } else {
        this.logger.warn(
          `R2_PUBLIC_URL (${base}) is not used: avatars and workspace logos share R2_BUCKET_NAME with every private object, ` +
            `and a domain on that bucket would serve them all. Set R2_PUBLIC_BUCKET_NAME to a bucket of their own and connect the domain to it alone.`,
        )
      }
    }
    return state
  }

  /**
   * THE PICTURES MOVE TO THEIR OWN BUCKET. Every avatar and logo uploaded
   * before `R2_PUBLIC_BUCKET_NAME` was set is in `R2_BUCKET_NAME`, and its
   * saved address (`/api/v1/public/images/<key>`) now looks for it in the
   * pictures' bucket. So each one there is read, written to the pictures'
   * bucket with its type and metadata, and only then deleted from the private
   * one. Idempotent: what is moved is no longer listed, and a boot that
   * stopped half way goes on where it stopped. Pictures are at most 5 MB.
   */
  async movePicturesToPublicBucket(): Promise<{ moved: number; failed: number }> {
    if (!this.client || !this.bucketName || !this.publicBucketName) return { moved: 0, failed: 0 }
    let moved = 0
    let failed = 0
    for (const prefix of PUBLIC_IMAGE_PREFIXES) {
      for (const o of await this.listIn(this.bucketName, prefix)) {
        // A picture's shape only: that is what is read from the pictures' bucket (`bucketFor`).
        if (!o.Key || !isPublicImageKey(o.Key)) continue
        try {
          const got = await this.client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: o.Key }))
          const body = got.Body ? Buffer.from(await (got.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray()) : Buffer.alloc(0)
          await this.client.send(
            new PutObjectCommand({
              Bucket: this.publicBucketName,
              Key: o.Key,
              Body: body,
              ContentType: got.ContentType ?? 'application/octet-stream',
              Metadata: got.Metadata ?? {},
            }),
          )
          await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: o.Key }))
          moved += 1
        } catch (err) {
          failed += 1
          this.logger.warn(`Could not move ${o.Key} to R2_PUBLIC_BUCKET_NAME: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
    if (moved || failed) {
      this.logger.log(`Moved ${moved} picture(s) from R2_BUCKET_NAME to R2_PUBLIC_BUCKET_NAME (${this.publicBucketName})${failed ? `; ${failed} could not be, and are tried again on the next boot` : ''}.`)
    }
    return { moved, failed }
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
   * Both shapes are recognised: `${R2_PUBLIC_URL}/<key>`, which a picture on
   * show is served at and which every object was once handed out as, and the
   * path-style presigned `${endpoint}/<bucket>/<key>?X-Amz-…`, of either bucket.
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
    if (this.endpoint && this.bucketName) {
      for (const bucket of [this.bucketName, this.publicBucketName]) {
        if (!bucket) continue
        const key = underPath(`${this.endpoint.replace(/\/$/, '')}/${bucket}`)
        if (key !== null) return key
      }
    }
    return null
  }

  /** From its own bucket, and a picture from the private one too (`bucketsHolding`). */
  async deleteObject(key: string): Promise<void> {
    this.requireConfigured()
    for (const bucket of this.bucketsHolding(key)) {
      await this.client!.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    }
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
        Bucket: this.bucketFor(destinationKey),
        Key: destinationKey,
        // `bucket/key`, URL-encoded, which is the header's defined form.
        CopySource: encodeURI(`${this.bucketFor(sourceKey)}/${sourceKey}`),
        MetadataDirective: 'REPLACE',
        ContentType: opts.contentType,
        Metadata: opts.metadata ?? {},
      }),
    )
  }

  async headObject(key: string) {
    this.requireConfigured()
    return this.client!.send(new HeadObjectCommand({ Bucket: this.bucketFor(key), Key: key }))
  }

  /**
   * EVERY object under a prefix, in key order. A listing answers one page, of
   * `pageSize` at most (1000 is the most S3 gives), and says when it stopped
   * short. Reading one page and trusting it is how the clip library came to
   * show a workspace's 200 OLDEST clips, since clip keys start with the moment
   * they were made (`found-23-sep/clip-library-lists-the-oldest-200`). A
   * continuation token that comes round again ends the walk instead of looping.
   * A picture prefix is read in both buckets that may hold it (`bucketsListing`),
   * each key once, still in key order.
   */
  async listAllObjects(prefix: string, pageSize = 1000) {
    this.requireConfigured()
    const buckets = this.bucketsListing(prefix)
    if (buckets.length === 1) return this.listIn(buckets[0], prefix, pageSize)
    const byKey = new Map<string, NonNullable<ListObjectsV2CommandOutput['Contents']>[number]>()
    for (const bucket of buckets) {
      for (const o of await this.listIn(bucket, prefix, pageSize)) if (o.Key && !byKey.has(o.Key)) byKey.set(o.Key, o)
    }
    return [...byKey.values()].sort((a, b) => Buffer.compare(Buffer.from(a.Key!), Buffer.from(b.Key!)))
  }

  /** Every object under a prefix in ONE bucket, page after page (see `listAllObjects`). */
  private async listIn(bucket: string, prefix: string, pageSize = 1000) {
    const all: NonNullable<ListObjectsV2CommandOutput['Contents']> = []
    const seen = new Set<string>()
    let token: string | undefined
    for (;;) {
      const page = await this.client!.send(
        new ListObjectsV2Command({
          Bucket: bucket,
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

