import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name)
  private readonly bucketName: string | null
  private readonly publicUrl: string | null
  private readonly client: S3Client | null

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID')
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID')
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY')
    const bucketName = this.config.get<string>('R2_BUCKET_NAME')
    const endpoint = this.config.get<string>('R2_ENDPOINT') ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined)
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL') ?? null
    this.bucketName = bucketName ?? null

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

  async deleteObject(key: string): Promise<void> {
    this.requireConfigured()
    await this.client!.send(new DeleteObjectCommand({ Bucket: this.bucketName!, Key: key }))
  }

  async headObject(key: string) {
    this.requireConfigured()
    return this.client!.send(new HeadObjectCommand({ Bucket: this.bucketName!, Key: key }))
  }

  async listObjects(prefix: string, maxKeys = 1000) {
    this.requireConfigured()
    return this.client!.send(
      new ListObjectsV2Command({
        Bucket: this.bucketName!,
        Prefix: prefix,
        MaxKeys: maxKeys,
      }),
    )
  }
}

