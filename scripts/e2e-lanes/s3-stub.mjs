#!/usr/bin/env node
/*
 * AN S3-COMPATIBLE STORE, SO "NO CREDENTIALS" STOPS BEING A VERDICT.
 *
 * The ledger records the cover picker's Upload tab as UNMEASURABLE: `R2Service`
 * logs "R2 is not fully configured" and `presignPutObject` throws "Storage is
 * not configured", so presign → PUT → commit cannot run. Three checks were
 * written against the UNCONFIGURED path instead — the tab offers a file
 * chooser, choosing one says so in words, the cover is left alone — and the
 * measured half of the tab stopped there.
 *
 * THAT REASON WAS NEVER ABOUT CREDENTIALS. It was about there being nowhere to
 * PUT to. `R2Service` already reads `R2_ENDPOINT` and already sets
 * `forcePathStyle: true`, which is the S3 dialect every S3-compatible server
 * speaks, so the product needs no change at all: point those four variables at
 * something local and the real presign, the real signed URL and the real
 * `getObjectUrl` all run. Cloudflare's own credentials were never the thing
 * being tested.
 *
 * WHY NOT MinIO. There is no container runtime on this machine — `docker info`
 * fails — and pulling an image over the proxy to test four HTTP verbs would
 * trade a reason I can check for one I cannot. The surface the upload path
 * actually touches is PUT, GET, HEAD, DELETE and one list, so it is written
 * out here and checked in, which also means the lane harness has no external
 * dependency to be unavailable on the day it is needed.
 *
 * THE SIGNATURE IS NOT VERIFIED, AND THAT IS THE POINT OF THE SEAM.
 * `getSignedUrl` signs locally — no network, no round trip — so what a real
 * bucket would check is the one part of this exchange the PRODUCT does not
 * perform. Verifying SigV4 here would test this file's understanding of SigV4,
 * not the product's. What IS asserted is everything the product does do: that
 * a presign was requested, that a PUT of the file's own bytes went to the URL
 * it returned, and that the bytes come back on a GET of the key that was
 * committed. `--strict` turns on the one guard worth having — a PUT with no
 * `X-Amz-Signature` at all is refused with 403, so a product that stopped
 * signing would be caught rather than quietly served.
 *
 * NOT FOR PRODUCTION, and it cannot become production by accident: it binds
 * loopback only, holds every object in memory, and refuses to start unless
 * `RUNDESK_S3_STUB=1` is set in the environment.
 *
 *   RUNDESK_S3_STUB=1 node scripts/e2e-lanes/s3-stub.mjs --port 9100 --bucket rundesk-test
 *
 * It prints one line of JSON on stdout when it is listening, so a caller can
 * wait for readiness rather than sleeping:
 *
 *   {"ready":true,"port":9100,"bucket":"rundesk-test","endpoint":"http://127.0.0.1:9100"}
 */
import { createServer } from 'node:http'

if (process.env.RUNDESK_S3_STUB !== '1') {
  console.error('[s3-stub] refusing to start without RUNDESK_S3_STUB=1 — this is a test double, not a store')
  process.exitCode = 1
  process.exit()
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const PORT = Number(arg('port', 9100))
const BUCKET = arg('bucket', 'rundesk-test')
const STRICT = process.argv.includes('--strict')

/** key → { body: Buffer, contentType: string, at: Date } */
const objects = new Map()
// Armed by `POST /__control/fail-next-put`, and consumed by the PUT it fires on.
let failNextPut = false

const xmlEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/*
 * S3 errors are XML with a `Code` the AWS SDK parses into a named exception —
 * `NoSuchKey` becomes `NoSuchKey`, and `getObject`'s callers in this tree
 * distinguish "missing" from "unconfigured". Returning a bare 404 would give
 * them an opaque failure to guess at, so the shape is kept.
 */
const s3Error = (res, status, code, message) => {
  const body = `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${xmlEscape(message)}</Message></Error>`
  res.writeHead(status, { 'content-type': 'application/xml', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

const server = createServer(async (req, res) => {
  let url
  try {
    url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  } catch {
    return s3Error(res, 400, 'InvalidURI', 'could not parse the request URI')
  }
  // Path style, which is what `forcePathStyle: true` produces: /<bucket>/<key>.
  const segments = url.pathname.split('/').filter(Boolean)
  const bucket = segments[0]
  const key = segments.slice(1).map(decodeURIComponent).join('/')

  /*
   * A CONTROL SEAM, SO "A FAILED UPLOAD SAYS SO" STAYS MEASURABLE.
   *
   * Before the stub existed, the only way to make an upload fail was to leave
   * storage unconfigured — and that is what `task-cover`'s upload checks were
   * written against, with `task-cover-11-upload-fails-silently` reddening the
   * sentence about it. Configuring storage would have retired a proven patch
   * along with the behaviour it proves, which is the wrong trade: the product
   * has to say so when an upload fails, whatever the reason it failed.
   *
   * So failure becomes something a caller can ask for, rather than a property
   * of the environment. One PUT, one refusal, consumed when it fires — a
   * latching failure mode would leak into whatever ran next in the same lane.
   * This is deliberately NOT keyed off the object key: deriving the key is the
   * product's business, and a suite that had to predict it would be asserting
   * against an implementation detail instead of driving a seam.
   */
  if (url.pathname === '/__control/fail-next-put' && req.method === 'POST') {
    failNextPut = true
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ failNextPut }))
  }

  if (bucket !== BUCKET) return s3Error(res, 404, 'NoSuchBucket', `no bucket named ${bucket}`)

  // ListObjectsV2 — bucket-scoped, no key.
  if (req.method === 'GET' && !key && url.searchParams.get('list-type') === '2') {
    const prefix = url.searchParams.get('prefix') ?? ''
    const max = Number(url.searchParams.get('max-keys') ?? 1000)
    const hits = [...objects.entries()].filter(([k]) => k.startsWith(prefix)).slice(0, max)
    const body =
      `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${xmlEscape(BUCKET)}</Name>` +
      `<Prefix>${xmlEscape(prefix)}</Prefix><KeyCount>${hits.length}</KeyCount>` +
      `<MaxKeys>${max}</MaxKeys><IsTruncated>false</IsTruncated>` +
      hits
        .map(
          ([k, o]) =>
            `<Contents><Key>${xmlEscape(k)}</Key><Size>${o.body.length}</Size>` +
            `<LastModified>${o.at.toISOString()}</LastModified></Contents>`,
        )
        .join('') +
      `</ListBucketResult>`
    res.writeHead(200, { 'content-type': 'application/xml', 'content-length': Buffer.byteLength(body) })
    return res.end(body)
  }

  if (!key) return s3Error(res, 400, 'InvalidRequest', 'no object key in the request path')

  if (req.method === 'PUT') {
    /*
     * The one guard worth keeping. A presigned PUT carries its signature in
     * the query string; the product either signs or it does not, and a stub
     * that serves an unsigned PUT would let a product that stopped signing
     * pass. The signature's CORRECTNESS is deliberately not checked — see the
     * header.
     */
    if (STRICT && !url.searchParams.has('X-Amz-Signature')) {
      return s3Error(res, 403, 'AccessDenied', 'the PUT carried no X-Amz-Signature')
    }
    if (failNextPut) {
      // Consumed FIRST, and before the body is read, so a refusal cannot leave
      // the flag armed for the next lane's upload if this handler throws.
      failNextPut = false
      await readBody(req)
      return s3Error(res, 500, 'InternalError', 'the stub was asked to refuse this PUT')
    }
    const body = await readBody(req)
    objects.set(key, {
      body,
      contentType: req.headers['content-type'] ?? 'application/octet-stream',
      at: new Date(),
    })
    res.writeHead(200, { etag: `"${key.length}-${body.length}"` })
    return res.end()
  }

  const found = objects.get(key)

  if (req.method === 'HEAD') {
    if (!found) {
      // A HEAD has no body by definition, so the XML would be discarded; the
      // SDK reads the STATUS for `headObject`, which is what callers branch on.
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'content-type': found.contentType, 'content-length': found.body.length })
    return res.end()
  }

  if (req.method === 'GET') {
    if (!found) return s3Error(res, 404, 'NoSuchKey', `no object at ${key}`)
    res.writeHead(200, { 'content-type': found.contentType, 'content-length': found.body.length })
    return res.end(found.body)
  }

  if (req.method === 'DELETE') {
    // S3 deletes are idempotent: removing what is not there is a 204, not an
    // error, and callers in this tree rely on that when tidying up.
    objects.delete(key)
    res.writeHead(204)
    return res.end()
  }

  return s3Error(res, 405, 'MethodNotAllowed', `${req.method} is not served here`)
})

server.listen(PORT, '127.0.0.1', () => {
  /*
   * ONE LINE OF JSON, FLUSHED BEFORE ANYONE WAITS ON IT. A caller that starts
   * this and then races a fixed sleep is the flake this is meant to remove, so
   * readiness is announced rather than assumed. `console.log` to a PIPE is
   * asynchronous, so this must not be followed by anything that exits.
   */
  console.log(
    JSON.stringify({ ready: true, port: PORT, bucket: BUCKET, endpoint: `http://127.0.0.1:${PORT}`, strict: STRICT }),
  )
})

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)))
