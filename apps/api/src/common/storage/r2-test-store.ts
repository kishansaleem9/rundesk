/**
 * A STORE IN MEMORY BEHIND A REAL `R2Service`, for its unit tests: the
 * service's own S3 client keeps its configuration, so `getSignedUrl` signs as
 * it does in production, and only `send` is answered here — put, get, head,
 * delete and list, bucket by bucket, as R2 answers them. And a public domain
 * connected to ONE of those buckets, as `fetch` would reach it: every key of
 * that bucket, unsigned (`found-30-sep/public-cdn-url-makes-every-object-public`).
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { R2Service } from './r2.service'

export type Stored = { body: Buffer; contentType?: string; metadata?: Record<string, string> }

export const r2With = (env: Record<string, string>) => new R2Service({ get: (k: string) => env[k] } as never)

export function fakeStore(r2: R2Service) {
  const buckets = new Map<string, Map<string, Stored>>()
  const sent: Array<{ command: string; bucket: string; key?: string; prefix?: string }> = []
  const bucket = (name: string) => {
    if (!buckets.has(name)) buckets.set(name, new Map())
    return buckets.get(name)!
  }
  const noSuchKey = (key: string) => Object.assign(new Error(`no object at ${key}`), { name: 'NoSuchKey' })
  const client = (r2 as unknown as { client: { send: (command: unknown) => Promise<unknown> } }).client
  client.send = async (command: unknown) => {
    if (command instanceof PutObjectCommand) {
      const { Bucket, Key, Body, ContentType, Metadata } = command.input
      sent.push({ command: 'put', bucket: Bucket!, key: Key })
      bucket(Bucket!).set(Key!, { body: Buffer.from(Body as string | Uint8Array), contentType: ContentType, metadata: Metadata })
      return {}
    }
    if (command instanceof GetObjectCommand) {
      const { Bucket, Key } = command.input
      sent.push({ command: 'get', bucket: Bucket!, key: Key })
      const o = bucket(Bucket!).get(Key!)
      if (!o) throw noSuchKey(Key!)
      return { Body: { transformToByteArray: async () => new Uint8Array(o.body) }, ContentType: o.contentType, Metadata: o.metadata }
    }
    if (command instanceof HeadObjectCommand) {
      const { Bucket, Key } = command.input
      sent.push({ command: 'head', bucket: Bucket!, key: Key })
      const o = bucket(Bucket!).get(Key!)
      if (!o) throw noSuchKey(Key!)
      return { ContentLength: o.body.length, ContentType: o.contentType, Metadata: o.metadata }
    }
    if (command instanceof DeleteObjectCommand) {
      const { Bucket, Key } = command.input
      sent.push({ command: 'delete', bucket: Bucket!, key: Key })
      bucket(Bucket!).delete(Key!)
      return {}
    }
    if (command instanceof ListObjectsV2Command) {
      const { Bucket, Prefix = '' } = command.input
      sent.push({ command: 'list', bucket: Bucket!, prefix: Prefix })
      const keys = [...bucket(Bucket!).keys()].filter((k) => k.startsWith(Prefix)).sort()
      return { Contents: keys.map((Key) => ({ Key, Size: bucket(Bucket!).get(Key)!.body.length })), IsTruncated: false }
    }
    throw new Error(`the test store does not answer ${(command as object).constructor.name}`)
  }
  /** A public domain at `base`, connected to `served`: every key of it, unsigned, and nothing else. */
  const domain = (base: string, served: string) => {
    const asked: string[] = []
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input)
      asked.push(url)
      if (!url.startsWith(`${base}/`)) return new Response('not this domain', { status: 404 })
      const o = bucket(served).get(decodeURIComponent(url.slice(base.length + 1)))
      return o ? new Response(new Uint8Array(o.body), { status: 200 }) : new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 })
    }) as typeof fetch
    return { fetchImpl, asked }
  }
  return { buckets, bucket, sent, domain }
}
