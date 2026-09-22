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
import { join, dirname } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
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
const KEY = 'tasks/probe/cover.png'
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
    out.listed = ((await r2.listObjects('tasks/probe/')).Contents ?? []).map((c) => c.Key)
    // The arranged failure, which is what keeps "a failed upload says so" measurable.
    await fetch('http://127.0.0.1:${PORT}/__control/fail-next-put', { method: 'POST' })
    const refusedUrl = await r2.presignPutObject('tasks/probe/second.png', 'image/png')
    out.arrangedFailStatus = (await fetch(refusedUrl, { method: 'PUT', body: BYTES })).status
    // And it does NOT latch: the very next PUT succeeds again.
    out.afterArrangedFail = (await fetch(refusedUrl, { method: 'PUT', body: BYTES })).status
    out.unsignedPut = (await fetch('http://127.0.0.1:${PORT}/' + '${BUCKET}' + '/' + KEY, { method: 'PUT', body: BYTES })).status
    await r2.deleteObject(KEY)
    out.afterDelete = await r2.getObject(KEY).then(() => 'still-there').catch((e: Error) => e.name)
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
  chk(out.arrangedFailStatus === 500, 'an arranged failure refuses the next PUT — so "a failed upload says so" stays measurable', `the arranged failure answered ${out.arrangedFailStatus}`)
  chk(out.afterArrangedFail === 200, 'and it does NOT latch — the PUT after it succeeds, so the failure cannot leak into the next suite', `the PUT after the arranged failure answered ${out.afterArrangedFail}`)
  chk(out.unsignedPut === 403, 'an UNSIGNED PUT is refused — a product that stopped signing would be caught, not quietly served', `an unsigned PUT answered ${out.unsignedPut}`)
  chk(out.afterDelete === 'NoSuchKey', 'a deleted object is gone, and says so with the code the SDK names', `after delete it answered ${out.afterDelete}`)
  chk(out.missingHead !== 'answered', 'and HEAD on a key that was never written does not answer as though it were', 'HEAD answered for an object that does not exist')
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
    ['it serves an unsigned PUT', "if (STRICT && !url.searchParams.has('X-Amz-Signature')) {", 'if (false) {'],
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
    ['the list is empty whatever is in the bucket', 'const hits = [...objects.entries()].filter(([k]) => k.startsWith(prefix)).slice(0, max)', 'const hits = []'],
    ['a stored object comes back with a byte changed', 'return res.end(found.body)', "return res.end(Buffer.concat([Buffer.from('X'), found.body.subarray(1)]))"],
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
      const named = (r.stdout ?? '').split('\n').filter((l) => l.includes('FAIL')).length
      if (r.status === 0) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — every case still passes`)
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
