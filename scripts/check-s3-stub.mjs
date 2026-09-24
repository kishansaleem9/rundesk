#!/usr/bin/env node
/*
 * THE STUB IS A TEST DOUBLE, SO IT NEEDS A TEST MORE THAN MOST THINGS DO.
 *
 * `scripts/e2e-lanes/s3-stub.mjs` exists to retire a reason: the ledger records
 * the cover picker's Upload tab as UNMEASURABLE because "presign → PUT → commit
 * cannot run without credentials this repository does not hold". That reason
 * was never about credentials — `R2Service` already reads `R2_ENDPOINT` and
 * already sets `forcePathStyle: true` — it was about there being nowhere to PUT
 * to. The stub is the somewhere.
 *
 * A DOUBLE THAT SILENTLY STOPS BEING FAITHFUL IS WORSE THAN NO DOUBLE. If the
 * stub answered 200 to everything, every suite built on it would go green while
 * measuring nothing, and the green would look like the measurement the ledger
 * was missing. So the contract is asserted against THE PRODUCT'S OWN CLIENT:
 * this file constructs the real `R2Service`, with the real AWS SDK, the real
 * SigV4 presigner and the real `getObjectUrl`, and drives it end to end. No
 * mock of the client, no reimplementation of the calls — if the SDK and the
 * stub disagree about the dialect, these cases fail.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED: that the signature VERIFIES. `getSignedUrl`
 * signs locally with no round trip, so verification is the one part of the
 * exchange the product never performs, and checking it here would test this
 * repository's understanding of SigV4 rather than the product's. What IS
 * asserted is that a signature is PRESENT and that an unsigned PUT is refused,
 * which is the part a product regression could actually reach.
 *
 *   node scripts/check-s3-stub.mjs            # the cases
 *   node scripts/check-s3-stub.mjs --mutate   # and that each one bites
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// The shared counter, and `lib/mutate.mjs` records why it is not `FAIL`
// and not `includes('FAIL')` — both were tried here and both were wrong.
import { namedFailures } from './lib/mutate.mjs'

const ROOT = join(HERE, '..')
const STUB = process.env.S3_STUB ?? join(HERE, 'e2e-lanes/s3-stub.mjs')

let pass = 0
let fail = 0
const failures = []
const chk = (cond, good, bad) => {
  if (cond) {
    pass += 1
    console.log(`  \x1b[32mPASS\x1b[0m ${good}`)
  } else {
    fail += 1
    failures.push(bad ?? good)
    console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`)
  }
}

/*
 * A PORT PER RUN, DERIVED FROM THE PROCESS ID rather than fixed, because
 * `--mutate` runs this file inside itself and two copies on one port would give
 * whichever bound first a monopoly and the other a confusing refusal.
 */
const PORT = 9300 + (process.pid % 400)
const BUCKET = 'rundesk-stub-cases'
const KEY_NAME = 'tasks/probe/cover.png'

/*
 * THE PROBE RUNS IN `apps/api`, because that is where `R2Service` and its
 * dependencies resolve from — and it runs under `tsx`, because the service is
 * TypeScript. Its output is JSON on the last line so this file reads a result
 * rather than scraping prose.
 */
const PROBE = `
import { R2Service } from './src/common/storage/r2.service'
const env: Record<string, string> = {
  R2_ENDPOINT: 'http://127.0.0.1:${PORT}',
  R2_ACCESS_KEY_ID: 'stub-key',
  R2_SECRET_ACCESS_KEY: 'stub-secret',
  R2_BUCKET_NAME: '${BUCKET}',
}
const r2 = new R2Service({ get: (k: string) => env[k] } as never)
const KEY = '${KEY_NAME}'
const BYTES = Buffer.from('\\x89PNG\\r\\n\\x1a\\nRUNDESK-COVER-BYTES')
async function main() {
  const out: Record<string, unknown> = {}
  try {
    out.configured = r2.configured
    const putUrl = await r2.presignPutObject(KEY, 'image/png')
    out.presignedHost = new URL(putUrl).host
    out.presignedSigned = new URL(putUrl).searchParams.has('X-Amz-Signature')
    const put = await fetch(putUrl, { method: 'PUT', body: BYTES, headers: { 'content-type': 'image/png' } })
    out.putStatus = put.status
    const head = await r2.headObject(KEY)
    out.headLength = head.ContentLength
    out.headType = head.ContentType
    out.roundTrip = (await r2.getObject(KEY)).equals(BYTES)
    const getUrl = await r2.getObjectUrl(KEY)
    const got = await fetch(getUrl)
    out.signedGetStatus = got.status
    out.signedGetBytes = Buffer.from(await got.arrayBuffer()).equals(BYTES)
    out.listed = (await r2.listAllObjects('tasks/probe/')).map((c) => c.Key)
    // IN KEY ORDER, AND IN PAGES: five keys written out of order, read two at
    // a time, which is three requests if the stub pages as S3 does.
    for (const k of ['e', 'b', 'd', 'a', 'c']) await r2.putObject('tasks/pages/' + k + '.txt', Buffer.from(k), 'text/plain')
    const pagesFrom = (await (await fetch('http://127.0.0.1:${PORT}/__control/requests')).json()).seq
    out.paged = (await r2.listAllObjects('tasks/pages/', 2)).map((c) => c.Key)
    const pageLog = await (await fetch('http://127.0.0.1:${PORT}/__control/requests')).json()
    out.pageRequests = (pageLog.requests as Array<{ n: number; method: string; key: string }>)
      .filter((r) => r.n > pagesFrom && r.method === 'GET' && !r.key).length
    // The arranged failure, which is what keeps "a failed upload says so" measurable.
    await fetch('http://127.0.0.1:${PORT}/__control/fail-next-put', { method: 'POST' })
    const refusedUrl = await r2.presignPutObject('tasks/probe/second.png', 'image/png')
    out.arrangedFailStatus = (await fetch(refusedUrl, { method: 'PUT', body: BYTES })).status
    // And it does NOT latch: the very next PUT succeeds again.
    out.afterArrangedFail = (await fetch(refusedUrl, { method: 'PUT', body: BYTES })).status
    out.unsignedPut = (await fetch('http://127.0.0.1:${PORT}/' + '${BUCKET}' + '/' + KEY, { method: 'PUT', body: BYTES })).status
    // A copy made inside the bucket — how a clip becomes a task's own
    // attachment. Asked for a type the source does not have, so REPLACE shows.
    out.copied = await r2.copyObject(KEY, 'tasks/probe/copy.bin', { contentType: 'application/x-rundesk-copy' })
      .then(() => 'copied').catch((e: Error) => e.name)
    out.copyRoundTrip = await r2.getObject('tasks/probe/copy.bin').then((b) => b.equals(BYTES)).catch(() => false)
    out.copyHeadType = await r2.headObject('tasks/probe/copy.bin').then((h) => h.ContentType).catch((e: Error) => e.name)
    out.copyMissing = await r2.copyObject('tasks/probe/never.png', 'tasks/probe/copy-of-nothing.png', { contentType: 'image/png' })
      .then(() => 'copied').catch((e: Error) => e.name)
    out.copyOfNothingStored = await r2.headObject('tasks/probe/copy-of-nothing.png').then(() => true).catch(() => false)
    // A PUT the API signs in its HEADER, not its query — how it uploads by itself.
    out.directPut = await r2.putObject('tasks/probe/direct.png', BYTES, 'image/png').then(() => 'stored').catch((e: Error) => e.name)
    out.directRoundTrip = await r2.getObject('tasks/probe/direct.png').then((b) => b.equals(BYTES)).catch(() => false)
    await r2.deleteObject(KEY)
    out.afterDelete = await r2.getObject(KEY).then(() => 'still-there').catch((e: Error) => e.name)
    // The request log: what a suite reads to prove the product did, or did
    // NOT, ask the bucket for something.
    const log = await (await fetch('http://127.0.0.1:${PORT}/__control/requests')).json()
    out.logSeq = log.seq
    out.logged = (log.requests as Array<{ n: number; method: string; key: string; bucket: string; copyOf?: string }>).map((r) => [r.n, r.method, r.key, r.bucket, r.copyOf ?? null])
    out.missingHead = await r2.headObject('tasks/probe/never.png').then(() => 'answered').catch((e: Error) => e.name)
  } catch (err) {
    out.threw = err instanceof Error ? \`\${err.name}: \${err.message}\` : String(err)
  }
  console.log('RESULT ' + JSON.stringify(out))
}
void main()
`

const startStub = () => {
  const child = spawn(process.execPath, [STUB, '--port', String(PORT), '--bucket', BUCKET, '--strict'], {
    env: { ...process.env, RUNDESK_S3_STUB: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new Promise((resolve, reject) => {
    let seen = ''
    const bail = setTimeout(() => reject(new Error(`the stub never announced itself: ${seen}`)), 15_000)
    child.stdout.on('data', (d) => {
      seen += d
      /*
       * READINESS IS READ, NOT SLEPT THROUGH. The stub prints one line of JSON
       * when it is listening; waiting for that line is the difference between
       * a harness that is deterministic and one that is usually fine.
       */
      if (/"ready":true/.test(seen)) {
        clearTimeout(bail)
        resolve(child)
      }
    })
    child.stderr.on('data', (d) => (seen += d))
    child.on('exit', (code) => {
      clearTimeout(bail)
      reject(new Error(`the stub exited with ${code}: ${seen}`))
    })
  })
}

const probe = () => {
  const file = join(ROOT, 'apps/api', `.s3-stub-probe-${process.pid}.ts`)
  try {
    writeFileSync(file, PROBE)
    const r = spawnSync('pnpm', ['exec', 'tsx', file], {
      cwd: join(ROOT, 'apps/api'),
      encoding: 'utf8',
      timeout: 120_000,
    })
    const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('RESULT '))
    if (!line) return { none: `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().slice(-400) }
    return JSON.parse(line.slice(7))
  } finally {
    rmSync(file, { force: true })
  }
}

const stub = await startStub()
let out
try {
  console.log('\n▶ the real R2Service, against the stub, with nothing mocked')
  out = probe()
  // Which source the running stub reports — what `lane-env.sh` compares with
  // the file on disk to restart a stale one.
  out.version = await fetch(`http://127.0.0.1:${PORT}/__control/version`).then((r) => r.json()).catch(() => null)
} finally {
  stub.kill('SIGTERM')
}

if (out.none !== undefined) {
  console.error(`\n[s3-stub] the probe printed no result:\n${out.none}`)
  process.exitCode = 1
} else {
  chk(!out.threw, 'the probe ran to the end', `it threw: ${out.threw}`)
  chk(out.configured === true, 'R2Service reports itself configured against a local endpoint', `configured was ${out.configured}`)
  chk(out.presignedHost === `127.0.0.1:${PORT}`, 'and presigns against that endpoint, not Cloudflare', `it presigned against ${out.presignedHost}`)
  chk(out.presignedSigned === true, 'with a real SigV4 signature on the URL', 'the presigned URL carried no X-Amz-Signature')
  chk(out.putStatus === 200, 'a presigned PUT is accepted', `the PUT answered ${out.putStatus}`)
  chk(out.headLength === 28 && out.headType === 'image/png', 'HEAD reports the size and type that were stored', `HEAD said ${out.headLength} / ${out.headType}`)
  chk(out.roundTrip === true, 'getObject returns the bytes that were PUT, unchanged', 'the bytes came back different')
  chk(out.signedGetStatus === 200 && out.signedGetBytes === true, 'and a signed getObjectUrl serves those same bytes — the path a cover renders through', `the signed GET answered ${out.signedGetStatus}`)
  chk(Array.isArray(out.listed) && out.listed.length === 1 && out.listed[0] === 'tasks/probe/cover.png', 'ListObjectsV2 finds the object under its prefix', `it listed ${JSON.stringify(out.listed)}`)
  chk(
    JSON.stringify(out.paged) === JSON.stringify(['a', 'b', 'c', 'd', 'e'].map((k) => `tasks/pages/${k}.txt`)),
    'ListObjectsV2 answers in key order, not the order objects were written, and a continuation token goes on from where a page stopped — every key once',
    `read two at a time, the listing gave ${JSON.stringify(out.paged)}`,
  )
  chk(
    out.pageRequests === 3,
    'and it answers in pages: five keys two at a time is three requests, the last one not truncated',
    `the listing took ${out.pageRequests} request(s)`,
  )
  chk(out.arrangedFailStatus === 500, 'an arranged failure refuses the next PUT — so "a failed upload says so" stays measurable', `the arranged failure answered ${out.arrangedFailStatus}`)
  chk(out.afterArrangedFail === 200, 'and it does NOT latch — the PUT after it succeeds, so the failure cannot leak into the next suite', `the PUT after the arranged failure answered ${out.afterArrangedFail}`)
  chk(out.unsignedPut === 403, 'an UNSIGNED PUT is refused — a product that stopped signing would be caught, not quietly served', `an unsigned PUT answered ${out.unsignedPut}`)
  chk(
    out.directPut === 'stored' && out.directRoundTrip === true,
    'while a PUT the API signs in its header is served — the product’s own uploads are signed too',
    `the API's own PUT answered ${out.directPut}; round trip ${out.directRoundTrip}`,
  )
  chk(
    out.copied === 'copied' && out.copyRoundTrip === true,
    'a copy made inside the bucket holds the source’s bytes — how a clip becomes a task’s own attachment',
    `the copy answered ${out.copied}; its bytes ${out.copyRoundTrip ? 'match' : 'do not match'}`,
  )
  chk(
    out.copyHeadType === 'application/x-rundesk-copy',
    'and carries the type the copy asked for, since it replaces the metadata',
    `HEAD on the copy said ${out.copyHeadType}`,
  )
  chk(
    out.copyMissing === 'NoSuchKey' && out.copyOfNothingStored === false,
    'a copy of a key that was never written fails with the code the SDK names, and stores nothing',
    `copying nothing answered ${out.copyMissing}; ${out.copyOfNothingStored ? 'an object now exists at the target' : 'nothing was stored'}`,
  )
  chk(out.afterDelete === 'NoSuchKey', 'a deleted object is gone, and says so with the code the SDK names', `after delete it answered ${out.afterDelete}`)
  chk(out.missingHead !== 'answered', 'and HEAD on a key that was never written does not answer as though it were', 'HEAD answered for an object that does not exist')
  const logged = Array.isArray(out.logged) ? out.logged : []
  const has = (method, key) => logged.some(([, m, k]) => m === method && k === key)
  chk(
    has('PUT', KEY_NAME) && has('DELETE', KEY_NAME),
    'the request log names the PUT and the DELETE the product sent, by key — so a suite can see what reached the bucket',
    `the log held ${JSON.stringify(logged).slice(0, 200)}`,
  )
  chk(
    logged.some(([, m, k, , c]) => m === 'PUT' && k === 'tasks/probe/copy.bin' && c === KEY_NAME) &&
      logged.some(([, m, k, , c]) => m === 'PUT' && k === KEY_NAME && c === null),
    'and says what a copy was copied from — so a suite can tell a copy from a second upload',
    `the copy's entry is ${JSON.stringify(logged.find(([, , k]) => k === 'tasks/probe/copy.bin') ?? null)}`,
  )
  chk(
    logged.length > 0 && logged.every(([n], i) => i === 0 || n > logged[i - 1][0]) && out.logSeq === logged[logged.length - 1][0],
    'in order, numbered, with the latest number reported — a suite reads the number first and looks only after it',
    `the numbers were ${JSON.stringify(logged.map(([n]) => n))} against seq ${out.logSeq}`,
  )
  chk(
    // By BUCKET: `/__control/requests` parses as bucket `__control`, key
    // `requests`, so a test on the key would be true of every log there is.
    logged.length > 0 && logged.every(([, , , b]) => b === BUCKET),
    'and the control routes are not in it — only what the product asked of the bucket',
    `the log includes a request outside the bucket: ${JSON.stringify(logged.find(([, , , b]) => b !== BUCKET))}`,
  )
  const wantSource = createHash('sha1').update(readFileSync(STUB)).digest('hex').slice(0, 12)
  chk(
    out.version?.source === wantSource,
    'the stub reports the hash of the source it is running — what the launcher compares, to restart a stale one',
    `it reported ${JSON.stringify(out.version)} against ${wantSource} for the file on disk`,
  )
}

console.log(
  `\n${fail === 0 && out.none === undefined ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} s3-stub: ` +
    `${pass} case(s) held, ${fail} did not`,
)

/*
 * AND THAT EACH CASE BITES. The same argument as every other checker here: a
 * contract whose cases all pass with the thing under test broken is a contract
 * that proves nothing, and a test double is exactly where that rots unnoticed.
 */
if (process.argv.includes('--mutate')) {
  const ORIGINAL = readFileSync(STUB, 'utf8')
  let blind = 0
  const MUTATIONS = [
    ['the stub answers 200 to every PUT without storing anything', 'objects.set(key, {', 'void 0 && objects.set(key, {'],
    ['it serves an unsigned PUT', 'if (STRICT && !signed) {', 'if (false) {'],
    ['it refuses a PUT signed in its header, as it did', "/\\bSignature=[0-9a-f]+/.test(String(req.headers.authorization ?? ''))", 'false'],
    ['a copy stores nothing', 'objects.set(key, copied)', 'void copied'],
    ['a copy stores other bytes than its source’s', 'body: Buffer.from(src.body),', "body: Buffer.from('X'),"],
    ['a copy keeps the source’s type when told to replace it', "contentType: replace ? req.headers['content-type'] ?? 'application/octet-stream' : src.contentType,", 'contentType: src.contentType,'],
    ['a copy of nothing succeeds, storing an empty object', "const src = objects.get(srcKey)\n      if (!src) return s3Error(res, 404, 'NoSuchKey', `no object at ${srcKey}`)", "const src = objects.get(srcKey) ?? { body: Buffer.alloc(0), contentType: 'application/octet-stream' }"],
    ['the log does not say what a copy was copied from', 'logged.copyOf = srcKey', 'void srcKey'],
    ['a deleted object is still there', 'objects.delete(key)', 'void key'],
    ['the arranged failure never fires', 'if (failNextPut) {', 'if (false) {'],
    ['the arranged failure LATCHES, leaking into the next upload', 'failNextPut = false\n      await readBody(req)', 'await readBody(req)'],
    /*
     * TWO MUTATIONS HAD TO BE REWRITTEN, and both were wrong in the same
     * instructive way: they broke the stub without making it LIE.
     *
     * Deleting the `if (!found)` guard from HEAD let the handler fall through
     * to `found.contentType` and throw, so the SDK saw a connection error and
     * the case that asks "does HEAD answer for a missing object" still got its
     * no. A mutation has to produce the WRONG ANSWER, not an absent one.
     *
     * And appending a byte to a GET response changed nothing observable,
     * because `content-length` is still the stored length and the client stops
     * reading there. The faithful corruption is same length, different byte.
     */
    ['HEAD answers for an object that was never written', "res.writeHead(404)\n      return res.end()", "res.writeHead(200, { 'content-length': 0 })\n      return res.end()"],
    ['the list is empty whatever is in the bucket', '.filter(([k]) => k.startsWith(prefix) && (after === null', ".filter(([k]) => k === '\\u0000' && (after === null"],
    ['the list answers in the order objects were written, not key order', '      .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))\n', ''],
    ['the list never says it stopped short', 'const truncated = matching.length > hits.length', 'const truncated = false'],
    ['a continuation token is ignored, so every page is the first', "const after = token ? Buffer.from(token, 'base64url').toString('utf8') : null", 'const after = null'],
    ['a stored object comes back with a byte changed', 'return res.end(found.body)', "return res.end(Buffer.concat([Buffer.from('X'), found.body.subarray(1)]))"],
    ['the request log records nothing', 'requests.push(logged)', 'void logged'],
    ['the request log forgets which key', 'const logged = { n: requestSeq, method: req.method, bucket, key }', "const logged = { n: requestSeq, method: req.method, bucket, key: '' }"],
    ['the log reports no position to read from', 'JSON.stringify({ seq: requestSeq, requests })', 'JSON.stringify({ seq: 0, requests })'],
    ['a stale stub reports the source on disk', 'return res.end(JSON.stringify({ source: SOURCE }))', "return res.end(JSON.stringify({ source: 'stale' }))"],
    ['control routes are logged as bucket traffic', "  if (url.pathname === '/__control/fail-next-put' && req.method === 'POST') {", "  requests.push({ n: ++requestSeq, method: req.method, bucket, key })\n  if (url.pathname === '/__control/fail-next-put' && req.method === 'POST') {"],
  ]
  console.log('\n▶ and each mutation of the stub reddens a case')
  for (const [label, from, to] of MUTATIONS) {
    if (ORIGINAL.split(from).length - 1 !== 1) {
      console.log(`  \x1b[31mANCHOR MISS\x1b[0m ${label}`)
      blind += 1
      continue
    }
    /*
     * Beside the original and never over it, for the reason
     * `check-suite-enders.mjs` records at length: a harness that writes the
     * file it tests can lose, and one that writes a copy into a directory the
     * file's own imports cannot reach proves nothing at all. This one has no
     * imports to break, and the rule is kept anyway.
     */
    const mutant = join(dirname(STUB), `.s3-stub-mutant-${label.replace(/\W+/g, '-')}.mjs`)
    try {
      writeFileSync(mutant, ORIGINAL.split(from).join(to))
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
        encoding: 'utf8',
        timeout: 180_000,
        env: { ...process.env, S3_STUB: mutant },
      })
      if (/the probe printed no result/.test(r.stderr ?? '')) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — the mutant never got a result back`)
        blind += 1
        continue
      }
      const named = namedFailures(r.stdout)
      if (r.status === 0) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — every case still passes`)
        blind += 1
      } else if (named === 0) {
        // Non-zero with nothing named is not a redden: this file stopped
        // before it could report, so the exit code is about the harness
        // rather than about the rule. Crediting it would be the same mistake
        // as crediting a mutant that never ran.
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — it exited non-zero but named no case`)
        blind += 1
      } else {
        console.log(`  \x1b[32mreddens\x1b[0m ${label} (${named} case(s))`)
      }
    } finally {
      rmSync(mutant, { force: true })
    }
  }
  console.log(
    `\n${blind === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} mutations: ` +
      `${MUTATIONS.length - blind} of ${MUTATIONS.length} bite`,
  )
  if (blind) fail += blind
}

if (fail) {
  console.error(`\n[s3-stub] ${fail} case(s) did not hold:`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exitCode = 1
}
