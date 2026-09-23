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
 * actually touches is PUT, GET, HEAD, DELETE, one list and a server-side copy,
 * so it is written out here and checked in, which also means the lane harness
 * has no external dependency to be unavailable on the day it is needed.
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
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

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
/*
 * WHICH SOURCE THIS PROCESS IS RUNNING. A lane's stub lives for days and the
 * launcher leaves a running one alone, so a change to this file never reached
 * a lane that was already up: the request log was added, and every lane went
 * on serving the stub from before it, where the new control route answered
 * NoSuchBucket. `lane-env.sh` compares this with the file on disk and restarts
 * a stub whose source has moved — the same refusal `verify.sh` makes of an API
 * built from older source.
 */
const SOURCE = createHash('sha1').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12)
const BUCKET = arg('bucket', 'rundesk-test')
const STRICT = process.argv.includes('--strict')

/** key → { body: Buffer, contentType: string, at: Date } */
const objects = new Map()
// Armed by `POST /__control/fail-next-put`, and consumed by the PUT it fires on.
let failNextPut = false
/*
 * EVERY BUCKET REQUEST, IN ORDER, so "the product did NOT touch the bucket" is
 * something a suite can read rather than assume. Removing a LINK attachment
 * used to send a DELETE for the link itself, and nothing a suite could see
 * changed: S3 deletes are idempotent, so the stub answered 204 to a key that
 * never existed. `n` is monotonic and survives `reset`, so a suite reads the
 * `n` before it acts and looks only at what came after — another suite's
 * earlier traffic, or a reset in between, cannot leak into its answer.
 * Capped, because a lane's stub lives for days.
 */
const requests = []
let requestSeq = 0
const REQUEST_LOG_CAP = 2000

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

  /*
   * AND A WAY TO DISARM IT, WHICH THE FIRST VERSION DID NOT HAVE.
   *
   * "Consumed when it fires" is only half a guarantee: an arranged failure
   * that is armed and never fires stays armed, and the stub outlives any one
   * suite run. That happened — a run arranged a failure, the press that should
   * have triggered it never reached the page, and the NEXT run's first upload
   * came back 500 with nothing in that run to explain it. A suite reading a
   * leftover from the run before is the worst kind of flake, because it is
   * reproducible in the wrong direction.
   *
   * So a caller can say "whatever was arranged, forget it", and the discipline
   * is to say it at the START of a section rather than trusting the end of the
   * last one.
   */
  if (url.pathname === '/__control/version' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ source: SOURCE }))
  }

  if (url.pathname === '/__control/requests' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ seq: requestSeq, requests }))
  }

  if (url.pathname === '/__control/reset' && req.method === 'POST') {
    failNextPut = false
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ failNextPut, objects: objects.size }))
  }

  /*
   * CORS, BECAUSE THE UPLOAD IS MADE BY A BROWSER AND A BROWSER ASKS FIRST.
   *
   * The presigned PUT is sent by the web app, from the app's own origin, with a
   * `content-type` header — which makes it a request Chromium will not send
   * until an `OPTIONS` preflight says it may. Without this the stub answered
   * 405 to that preflight and the PUT never left: the suite reported a presign
   * that succeeded and "the PUTs to the store answered []", which is precisely
   * the facade shape it was written to catch, manufactured by the double.
   *
   * This is not a liberty the stub is taking. A bucket that serves browser
   * uploads must be configured with exactly this, and R2's own documentation
   * makes it the first step of the presigned-upload recipe. A stub that refused
   * it would be modelling a MISCONFIGURED bucket and calling the product broken
   * for it. `*` is right here and nowhere else: this binds loopback and refuses
   * to start without RUNDESK_S3_STUB=1.
   */
  const cors = {
    'access-control-allow-origin': req.headers.origin ?? '*',
    'access-control-allow-methods': 'GET,PUT,HEAD,DELETE,OPTIONS',
    'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '*',
    'access-control-expose-headers': 'etag',
    'access-control-max-age': '600',
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    return res.end()
  }
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v)

  // Control routes returned above and preflights carry no intent, so what is
  // recorded is exactly what the product asked the bucket to do.
  requestSeq += 1
  // Kept by reference: a copy notes its source on this entry once it is known.
  const logged = { n: requestSeq, method: req.method, bucket, key }
  requests.push(logged)
  if (requests.length > REQUEST_LOG_CAP) requests.shift()

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
     *
     * AND A REQUEST THE API SENDS ITSELF IS SIGNED TOO, in its `Authorization`
     * header rather than its query string. Reading only the query refused
     * every PUT the SDK sends directly (`putObject`, and a copy), so under
     * `--strict` — which is how CI runs this — the product's own server-side
     * uploads were refused as unsigned.
     */
    const signed =
      url.searchParams.has('X-Amz-Signature') || /\bSignature=[0-9a-f]+/.test(String(req.headers.authorization ?? ''))
    if (STRICT && !signed) {
      return s3Error(res, 403, 'AccessDenied', 'the PUT carried no signature')
    }
    if (failNextPut) {
      // Consumed FIRST, and before the body is read, so a refusal cannot leave
      // the flag armed for the next lane's upload if this handler throws. A
      // copy is a PUT too, and consumes it the same way.
      failNextPut = false
      await readBody(req)
      return s3Error(res, 500, 'InternalError', 'the stub was asked to refuse this PUT')
    }
    /*
     * CopyObject: a PUT with `x-amz-copy-source: <bucket>/<key>` (URL-encoded,
     * sometimes with a leading slash) and no body. Served because the product
     * copies a clip into a task's own prefix; without this the copy would be
     * stored as an EMPTY object, a 200 for bytes that never moved.
     */
    const copySource = req.headers['x-amz-copy-source']
    if (copySource) {
      await readBody(req)
      const [srcBucket, ...rest] = decodeURIComponent(String(copySource)).replace(/^\//, '').split('/')
      const srcKey = rest.join('/')
      logged.copyOf = srcKey
      if (srcBucket !== BUCKET) return s3Error(res, 404, 'NoSuchBucket', `no bucket named ${srcBucket}`)
      const src = objects.get(srcKey)
      if (!src) return s3Error(res, 404, 'NoSuchKey', `no object at ${srcKey}`)
      const replace = String(req.headers['x-amz-metadata-directive'] ?? '').toUpperCase() === 'REPLACE'
      const copied = {
        body: Buffer.from(src.body),
        contentType: replace ? req.headers['content-type'] ?? 'application/octet-stream' : src.contentType,
        at: new Date(),
      }
      objects.set(key, copied)
      const xml =
        `<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult>` +
        `<LastModified>${copied.at.toISOString()}</LastModified><ETag>"${key.length}-${copied.body.length}"</ETag>` +
        `</CopyObjectResult>`
      res.writeHead(200, { 'content-type': 'application/xml', 'content-length': Buffer.byteLength(xml) })
      return res.end(xml)
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
    JSON.stringify({ ready: true, port: PORT, bucket: BUCKET, endpoint: `http://127.0.0.1:${PORT}`, strict: STRICT, source: SOURCE }),
  )
})

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)))
