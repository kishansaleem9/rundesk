/**
 * WHERE `R2_PUBLIC_URL` IS A PUBLIC DOMAIN, WHAT SITS BEHIND A READ RULE IS
 * STILL HANDED OUT SIGNED, AND NOTHING OF IT IS WHERE THAT DOMAIN SERVES
 * (`found-30-sep/public-cdn-url-makes-every-object-public`).
 *
 * NOT A FRAME ROW. `R2Service.getObjectUrl` answered `${R2_PUBLIC_URL}/<key>`
 * whenever that was not the raw R2 API host, for every object: a task's files
 * and cover, a clip, a call's recording, a chat file. A custom domain connected
 * to an R2 bucket makes the whole bucket public, so each of those was readable
 * by its permanent address, by anybody who had once been handed it — a member
 * since removed, a guest the task is no longer shared with, a link that was
 * forwarded — for as long as the object lived. And the address is the key,
 * `<prefix>/<milliseconds>-<name>`, which is not a secret.
 *
 * ClickUp: "The Private Attachment Links setting requires that the person
 * accessing a Workspace attachment is logged into that Workspace" (help centre,
 * "Private Attachment Links", read through search excerpts). Rundesk has no
 * setting that makes an attachment public, and its read rules — private tasks
 * and lists, guests, a workspace that blocks public links — mean nothing if the
 * file is at an address anybody can keep. So what sits behind a read rule is
 * signed, for minutes, and only for somebody the rule let through, whatever
 * `R2_PUBLIC_URL` says. The pictures on show — avatars and workspace logos,
 * drawn on a sign-in page before anybody signs in — are public by design and
 * keep the public domain.
 *
 * SIGNING WAS NOT ENOUGH, as review found. A custom domain connected to an R2
 * bucket serves every key in it — Cloudflare: "When you connect a Custom
 * Domain, your R2 bucket becomes publicly accessible" — and the key of a task's
 * file is in the path of every signed URL for it. Where the domain was on the
 * bucket everything is kept in, a member removed from the workspace who had
 * once been handed the file's signed URL read it at the domain, unsigned, for
 * as long as it lived; and the images route, sending anybody to an avatar at
 * the domain, told them where it was. So the pictures have a bucket of their
 * own (`R2_PUBLIC_BUCKET_NAME`), the domain is used only for them and only
 * while it is seen not to serve the private bucket, and the API says so when
 * it does.
 *
 * THE DEPLOYMENTS, STOOD UP HERE. No lane and no CI step sets `R2_PUBLIC_URL`,
 * and each suite shares one API, so this one starts its own: a store of its own
 * (`s3-stub.mjs`, `--strict`, on a free port) with two buckets — the private
 * one and the pictures' — and, one after another, three APIs from this
 * checkout's build (`apps/api/dist`), on the lane's database. A "public domain"
 * is a bucket's path on that store: every key of that bucket, unsigned, as an
 * R2 custom domain connected to it serves.
 *
 *   A. the domain on the private bucket, and no bucket of the pictures' own —
 *      the deployment the item found;
 *   B. the pictures in their own bucket, and the domain on it alone — the
 *      deployment the fix asks for, reached from A by a restart, so what A
 *      stored is there;
 *   C. the pictures in their own bucket, but the domain left on the private
 *      one — an upgrade done half way.
 *
 * Each is stopped before the next starts, and the store when the run ends.
 * `--api` is accepted, as every suite takes it, and not used.
 *
 *   node test/e2e/private-object-urls.mjs --api 3011
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { signUpApi } from './lib/signin.mjs'
import { openDb, databaseUrl } from './lib/db.mjs'
import { apiAs as apiAsAt, must } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 13

const REPO = path.resolve(import.meta.dirname, '../..')
const API_DIR = path.join(REPO, 'apps/api')
const MAIN = 'dist/apps/api/src/main.js'
const STUB = path.join(REPO, 'scripts/e2e-lanes/s3-stub.mjs')
const BUCKET = 'rundesk-public-domain'
/** The pictures' own bucket, in deployments B and C (`R2_PUBLIC_BUCKET_NAME`). */
const PICTURES = 'rundesk-public-domain-pictures'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/** A loopback port nothing listens on right now, chosen by the OS. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })

/**
 * A child process, its output kept, and a stop that waits for it. The last
 * lines are what a failure names; and what an API says of its public domain,
 * when it starts, comes after the hundreds of lines naming its routes, so a
 * run's worth is kept rather than the last sixty.
 */
const started = []
const start = (args, opts) => {
  const child = spawn(process.execPath, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
  const out = []
  const keep = (b) => {
    out.push(...String(b).split('\n').filter(Boolean))
    if (out.length > 5000) out.splice(0, out.length - 5000)
  }
  child.stdout.on('data', keep)
  child.stderr.on('data', keep)
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGTERM')
    const gone = await Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), 5000))])
    if (!gone) child.kill('SIGKILL')
  }
  const proc = { child, out, stop, exited }
  started.push(proc)
  return proc
}

/** The bucket a path-style URL of the store names. */
const bucketIn = (url) => {
  try {
    return new URL(url).pathname.split('/')[1] ?? null
  } catch {
    return null
  }
}
/** The status an unsigned GET of a URL answers, or 0. */
const statusAt = (url) => fetch(url).then(async (r) => (await r.arrayBuffer().catch(() => null), r.status), () => 0)
/** A URL signed for a window: S3's query signature, with its expiry. */
const isSigned = (url) => {
  try {
    const q = new URL(url).searchParams
    return q.has('X-Amz-Signature') && Number(q.get('X-Amz-Expires')) > 0
  } catch {
    return false
  }
}
/** The bytes a URL serves, or null. */
const bytesAt = (url) =>
  typeof url === 'string' && /^https?:\/\//.test(url)
    ? fetch(url).then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null), () => null)
    : Promise.resolve(null)
const short = (v) => JSON.stringify(v ?? null).slice(0, 140)

const stamp = Date.now()
const TAG = `pou-${stamp}`
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARgwMDAwMAA8IAWYAAAAASUVORK5CYII=',
  'base64',
)
let sql = null
let userId = null

try {
  // ══ THE STORE ════════════════════════════════════════════════════════════
  const db = databaseUrl()
  if (!db) throw new Error('no DATABASE_URL — this suite starts APIs of its own on the lane\'s database')
  if (!fs.existsSync(path.join(API_DIR, MAIN))) throw new Error(`no API build at apps/api/${MAIN} — build it first`)

  const storePort = await freePort()
  const store = start([STUB, '--port', String(storePort), '--bucket', BUCKET, '--bucket', PICTURES, '--strict'], {
    env: { ...process.env, RUNDESK_S3_STUB: '1' },
  })
  const storeUp = await waitUntil(() => store.out.some((l) => l.includes('"ready":true')), { timeoutMs: 15_000 })
  if (!storeUp) throw new Error(`the store never said it was ready: ${store.out.slice(-5).join(' | ')}`)
  const ENDPOINT = `http://127.0.0.1:${storePort}`
  /** A public domain connected to `bucket`: every key of it, unsigned, as an R2 custom domain serves it. */
  const domainOn = (bucket) => `${ENDPOINT}/${bucket}`
  /** Where the private bucket's objects are read, unsigned, by whoever has a domain on it. */
  const PRIVATE_DOMAIN = domainOn(BUCKET)
  const PICTURES_DOMAIN = domainOn(PICTURES)
  const publicAddress = (key) => `${PRIVATE_DOMAIN}/${key}`

  const tsx = path.dirname(createRequire(path.join(API_DIR, 'package.json')).resolve('tsx/package.json'))
  /** An API of this suite's own from this checkout's build, with the storage variables given; up, or a throw naming why not. */
  const startApi = async (name, storage) => {
    const port = await freePort()
    const proc = start(
      ['--require', path.join(tsx, 'dist/preflight.cjs'), '--import', pathToFileURL(path.join(tsx, 'dist/loader.mjs')).href, MAIN],
      {
        cwd: API_DIR,
        env: {
          ...process.env,
          PORT: String(port),
          DATABASE_URL: db,
          JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'private-object-urls-access-secret-0123456789',
          JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'private-object-urls-refresh-secret-012345678',
          R2_ACCOUNT_ID: '',
          R2_ENDPOINT: ENDPOINT,
          R2_ACCESS_KEY_ID: 'stub-key',
          R2_SECRET_ACCESS_KEY: 'stub-secret',
          R2_BUCKET_NAME: BUCKET,
          R2_PUBLIC_BUCKET_NAME: '',
          TRUST_PROXY: '1',
          ...storage,
        },
      },
    )
    const base = `http://127.0.0.1:${port}`
    const up = await waitUntil(
      async () => proc.child.exitCode === null && (await fetch(`${base}/api/v1/health`).then((r) => r.ok, () => false)),
      { timeoutMs: 120_000, stepMs: 500 },
    )
    if (!up) throw new Error(`API ${name} of this suite never came up: ${proc.out.slice(-8).join(' | ')}`)
    const vars = Object.entries(storage).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`  (API ${name}: its own, on ${port}, from this checkout's build; ${vars})`)
    /** What it has said in its log, colours taken out. */
    const said = () => proc.out.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''))
    return { base, API: `${base}/api/v1`, proc, said }
  }
  /** Follow a picture's saved address on an API: where it sends a viewer, and what is there. */
  const follow = async (apiBase, savedAddress) => {
    const first = await fetch(`${apiBase}${savedAddress}`, { redirect: 'manual' }).catch(() => null)
    const location = first?.headers.get('location') ?? ''
    return { status: first?.status ?? 0, location, bytes: await bytesAt(location) }
  }

  // ══ A. THE DOMAIN ON THE PRIVATE BUCKET ══════════════════════════════════
  console.log('\n▶ A. R2_PUBLIC_URL on the private bucket, and the pictures in it too — the deployment the item found')
  const a = await startApi('A', { R2_PUBLIC_URL: PRIVATE_DOMAIN })
  sql = await openDb()
  if (!sql) throw new Error('no database handle — a meeting\'s recording is written by SQL, as the call would write it')
  const apiAs = apiAsAt(a.API, { noAnswer: 'throw' })

  // One person of this run's own, and the workspace their sign-up made.
  const me = await signUpApi(a.API, {
    fullName: `Private objects ${TAG}`,
    email: `${TAG}@rundesk.invalid`,
    password: 'Objects@12345!',
    organizationName: `Private objects ${TAG}`,
  })
  userId = me.user?.id ?? null
  let A = apiAs(me.accessToken)
  const WS = must(await A('/workspaces'), 'list my workspaces').map((r) => r.workspace ?? r).find((w) => w?.id)?.id
  if (!WS) throw new Error('the sign-up made no workspace')
  const space = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `Objects ${TAG}` } }), 'make a space')
  const project = must(await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `Objects ${TAG}` } }), 'make a project')
  const list = must(await A('/lists', { method: 'POST', body: { projectId: project.id, name: `Objects ${TAG}` } }), 'make a list')
  const task = must(await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Objects ${TAG}` } }), 'make a task')

  /** Presign, PUT the bytes, and the presign's answer — or a throw naming the step refused. */
  const upload = async (route, body, bytes, type) => {
    const pre = must(await A(route, { method: 'POST', body }), `presign ${route}`)
    const put = await fetch(pre.uploadUrl, { method: 'PUT', headers: { 'content-type': type }, body: bytes }).then((r) => r.status, () => 0)
    if (put !== 200) throw new Error(`the PUT for ${route} answered ${put}`)
    return pre
  }
  /** A task's file, uploaded and recorded; its presign's answer. */
  const taskFile = async (name) => {
    const pre = await upload(`/tasks/${task.id}/attachments/presign`, { fileName: name, contentType: 'image/png', sizeBytes: PNG.length }, PNG, 'image/png')
    must(
      await A(`/tasks/${task.id}/attachments`, { method: 'POST', body: { fileName: name, storageKey: pre.storageKey, contentType: 'image/png', sizeBytes: PNG.length } }),
      'record the task\'s file',
    )
    return pre
  }
  /** An avatar and a workspace logo, uploaded and saved; each one's key, presigned upload URL and saved address. */
  const pictures = async () => {
    const put = async (presignRoute, save) => {
      const p = await upload(presignRoute, { contentType: 'image/png', sizeBytes: PNG.length }, PNG, 'image/png')
      must(await save(p.publicUrl), `save ${presignRoute}`)
      return { key: p.storageKey, uploadUrl: p.uploadUrl, saved: p.publicUrl }
    }
    return {
      avatar: await put('/users/me/avatar/presign', (address) => A('/users/me', { method: 'PATCH', body: { avatarUrl: address } })),
      logo: await put(`/workspaces/${WS}/logo/presign`, (address) => A(`/workspaces/${WS}`, { method: 'PATCH', body: { logoUrl: address } })),
    }
  }

  // ── A task's file and its cover ──
  const FILE = `plan-${stamp}.png`
  const pre = await taskFile(FILE)
  /*
   * THE DEPLOYMENT THIS IS ABOUT: its public domain serves the task's file by
   * its permanent address, with no signature — as a custom domain connected to
   * the bucket does. Were it not so, nothing below would be measuring the item.
   */
  const atPublic = await bytesAt(publicAddress(pre.storageKey))
  chk(
    atPublic !== null && atPublic.equals(PNG),
    'this API\'s public domain serves any key of its bucket, unsigned, as an R2 custom domain does — the deployment this suite is about',
    `${publicAddress(pre.storageKey).slice(0, 120)} served ${atPublic === null ? 'nothing' : `${atPublic.length} other byte(s)`}`,
  )
  const row = (must(await A(`/tasks/${task.id}/attachments`), 'list the task\'s files') ?? []).find((r) => r.fileName === FILE)
  const rowBytes = await bytesAt(row?.url)
  chk(
    isSigned(row?.url) && row.url !== publicAddress(pre.storageKey) && rowBytes !== null && rowBytes.equals(PNG),
    'a task\'s file is handed out signed, for a window, not at its permanent public address — and the signed URL serves it',
    `the list's Download link is ${short(row?.url)}; it served ${rowBytes === null ? 'nothing' : `${rowBytes.length} byte(s)`}`,
  )
  must(await A(`/tasks/${task.id}`, { method: 'PATCH', body: { coverStorageKey: pre.storageKey } }), 'make the file the task\'s cover')
  const covered = must(await A(`/tasks/${task.id}`), 'read the task')
  chk(
    isSigned(covered?.coverUrl) && covered.coverUrl !== publicAddress(pre.storageKey),
    'and so is its cover, the same file as the task\'s picture',
    `coverStorageKey=${short(covered?.coverStorageKey)}, coverUrl=${short(covered?.coverUrl)}`,
  )

  // ── A chat file ──
  const channel = must(await A(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `objects-${stamp}` } }), 'make a channel')
  const chatPre = await upload(
    `/chat/channels/${channel.id}/attachments/presign`,
    { fileName: `chat-${stamp}.png`, contentType: 'image/png', sizeBytes: PNG.length },
    PNG,
    'image/png',
  )
  const recorded = must(
    await A(`/chat/channels/${channel.id}/attachments`, {
      method: 'POST',
      body: { fileName: `chat-${stamp}.png`, contentType: 'image/png', sizeBytes: PNG.length, storageKey: chatPre.storageKey },
    }),
    'record the chat file',
  )
  const message = must(
    await A(`/chat/channels/${channel.id}/messages`, { method: 'POST', body: { body: `${TAG} file`, attachmentIds: [recorded.id] } }),
    'post the message',
  )
  const listed = must(await A(`/chat/channels/${channel.id}/messages`), 'read the channel')
  const messages = Array.isArray(listed) ? listed : listed?.messages ?? listed?.items ?? []
  const chatUrl = messages.find((m) => m.id === message.id)?.attachments?.[0]?.url
  chk(
    isSigned(recorded.url) && isSigned(chatUrl) && chatUrl !== publicAddress(chatPre.storageKey),
    'a chat file is handed out signed, when it is sent and when the channel is read',
    `recorded with ${short(recorded.url)}; the channel reads ${short(chatUrl)}`,
  )

  // ── A clip ──
  const CLIP = Buffer.from(`clip bytes ${TAG}`)
  const clipPre = await upload(
    `/workspaces/${WS}/clips/presign`,
    { fileName: `clip-${stamp}.webm`, contentType: 'video/webm', durationSeconds: 3, title: `Clip ${TAG}` },
    CLIP,
    'video/webm',
  )
  const link = must(await A(`/workspaces/${WS}/clips/link`, { method: 'POST', body: { storageKey: clipPre.storageKey } }), 'ask for the clip\'s link')
  const watched = must(await A(`/public/clips/${link.token}`), 'open the clip\'s link')
  const library = must(await A(`/workspaces/${WS}/clips`), 'list the clips')
  const inLibrary = (Array.isArray(library) ? library : []).find((c) => c.storageKey === clipPre.storageKey)?.url
  const played = await bytesAt(watched?.url)
  chk(
    isSigned(watched?.url) && watched.url !== publicAddress(clipPre.storageKey) && played !== null && played.equals(CLIP) &&
      isSigned(inLibrary) && inLibrary !== publicAddress(clipPre.storageKey),
    'a clip\'s link plays it through a signed URL, and the library lists it signed — neither is its permanent address',
    `the link plays ${short(watched?.url)} (${played === null ? 'nothing' : `${played.length} byte(s)`}); the library lists ${short(inLibrary)}`,
  )

  // ── A call's recording on its meeting ──
  const meeting = must(await A(`/workspaces/${WS}/meetings`, { method: 'POST', body: { title: `Meeting ${TAG}` } }), 'make a meeting')
  // The key, in the shape the recording's presign mints, written as the call writes it.
  const REC_KEY = `calls/${WS}/11111111-1111-1111-1111-111111111111/recording-${stamp}.webm`
  await sql`update meetings set recording_url = ${REC_KEY} where id = ${meeting.id}`
  const recording = must(await A(`/workspaces/${WS}/meetings/${meeting.id}`), 'read the meeting')?.recordingUrl
  chk(
    isSigned(recording) && recording !== publicAddress(REC_KEY),
    'a call\'s recording is handed out signed on its meeting',
    `the meeting's recordingUrl is ${short(recording)}`,
  )

  // ── The pictures: in the private bucket here, so never at the domain ──
  /*
   * WHERE THE DOMAIN SERVES THE PRIVATE BUCKET, NO ROUTE SAYS WHERE IT IS. The
   * images route answers anybody, signed in or not, for any key of a
   * picture's shape; it sent them to `<domain>/avatars/…`, and the domain,
   * once known, served every task file by its key. Here the pictures are in
   * the private bucket, so they are signed like everything in it.
   */
  const shared = await pictures()
  const signedPicture = async (apiBase, p, bucket) => {
    const f = await follow(apiBase, p.saved)
    return { ...f, ok: f.status === 302 && isSigned(f.location) && bucketIn(f.location) === bucket && f.bytes !== null && f.bytes.equals(PNG) }
  }
  const aAvatar = await signedPicture(a.base, shared.avatar, BUCKET)
  const aLogo = await signedPicture(a.base, shared.logo, BUCKET)
  chk(
    aAvatar.ok && aLogo.ok,
    'and no route tells anybody where that domain is: an avatar and a workspace logo are sent to a signed URL, which serves them, not to their address at the domain',
    `the avatar's address answered ${aAvatar.status} → ${short(aAvatar.location)}; the logo's ${aLogo.status} → ${short(aLogo.location)}`,
  )
  const aSaid = await waitUntil(() => a.said().some((l) => l.includes(`R2_PUBLIC_URL (${PRIVATE_DOMAIN}) serves the objects of R2_BUCKET_NAME (${BUCKET})`)), { timeoutMs: 5_000 })
  const aLine = a.said().find((l) => l.includes('R2_PUBLIC_URL')) ?? ''
  chk(
    aSaid && /\bERROR\b/.test(aLine) && aLine.includes(`Disconnect that domain from ${BUCKET}`) && aLine.includes('set R2_PUBLIC_BUCKET_NAME'),
    'and the API says, as an error, when it starts, that the domain serves the private bucket to anybody: disconnect it, and give the pictures a bucket of their own',
    `it said ${short(aLine || a.said().slice(-3).join(' | '))}`,
  )
  await a.proc.stop()

  // ══ B. THE PICTURES IN A BUCKET OF THEIR OWN ═════════════════════════════
  console.log('\n▶ B. R2_PUBLIC_BUCKET_NAME set, and R2_PUBLIC_URL on that bucket alone — the deployment the fix asks for')
  const b = await startApi('B', { R2_PUBLIC_BUCKET_NAME: PICTURES, R2_PUBLIC_URL: PICTURES_DOMAIN })
  A = apiAsAt(b.API, { noAnswer: 'throw' })(me.accessToken)
  /*
   * THE CHAIN REVIEW FOUND, ASKED AGAIN. Anybody once handed a task's file has
   * its key: it is the signed URL's path. Where the domain serves the pictures'
   * bucket alone, that key read there is not found — the file A stored, and a
   * file stored now, which B keeps in the private bucket and hands out signed.
   */
  const bFile = await taskFile(`plan-b-${stamp}.png`)
  const bRow = (must(await A(`/tasks/${task.id}/attachments`), 'list the task\'s files on B') ?? []).find((r) => r.storageKey === bFile.storageKey || r.fileName === `plan-b-${stamp}.png`)
  const bRowBytes = await bytesAt(bRow?.url)
  const keysAtDomain = {
    stored_under_A: await statusAt(`${PICTURES_DOMAIN}/${pre.storageKey}`),
    stored_now: await statusAt(`${PICTURES_DOMAIN}/${bFile.storageKey}`),
  }
  chk(
    isSigned(bRow?.url) && bucketIn(bRow.url) === BUCKET && bRowBytes !== null && bRowBytes.equals(PNG) &&
      keysAtDomain.stored_under_A === 404 && keysAtDomain.stored_now === 404,
    'where the pictures have a bucket of their own, a task\'s file stays in the private bucket and is handed out signed — and read by its key at the public domain, as anybody once handed its URL could, it is not there',
    `the Download link is ${short(bRow?.url)} (${bRowBytes === null ? 'nothing' : `${bRowBytes.length} byte(s)`}); its key and A's at the domain answered ${JSON.stringify(keysAtDomain)}`,
  )
  // The pictures A saved in the private bucket move into their own when B starts.
  const moved = async (p) =>
    (await statusAt(`${PICTURES_DOMAIN}/${p.key}`)) === 200 && (await statusAt(`${PRIVATE_DOMAIN}/${p.key}`)) === 404
  await waitUntil(async () => (await moved(shared.avatar)) && (await moved(shared.logo)), { timeoutMs: 15_000 })
  const onDomain = async (apiBase, p) => {
    const f = await follow(apiBase, p.saved)
    const inPrivate = await statusAt(`${PRIVATE_DOMAIN}/${p.key}`)
    return { ...f, inPrivate, ok: f.status === 302 && f.location === `${PICTURES_DOMAIN}/${p.key}` && f.bytes !== null && f.bytes.equals(PNG) && inPrivate === 404 }
  }
  const bOldAvatar = await onDomain(b.base, shared.avatar)
  const bOldLogo = await onDomain(b.base, shared.logo)
  chk(
    bOldAvatar.ok && bOldLogo.ok,
    'an avatar and a logo saved while the pictures shared the private bucket are moved into their own when the API starts, and still load at their saved address — from the public domain',
    `the avatar's address answered ${bOldAvatar.status} → ${short(bOldAvatar.location)} (in the private bucket: ${bOldAvatar.inPrivate}); the logo's ${bOldLogo.status} → ${short(bOldLogo.location)} (${bOldLogo.inPrivate})`,
  )
  const fresh = await pictures()
  const bNewAvatar = await onDomain(b.base, fresh.avatar)
  const bNewLogo = await onDomain(b.base, fresh.logo)
  const uploadedTo = [bucketIn(fresh.avatar.uploadUrl), bucketIn(fresh.logo.uploadUrl)]
  chk(
    bNewAvatar.ok && bNewLogo.ok && uploadedTo.every((x) => x === PICTURES),
    'an avatar and a workspace logo uploaded now go to the pictures\' bucket, and their saved address sends a viewer to the public domain, unsigned, which serves them — public by design',
    `uploaded to ${JSON.stringify(uploadedTo)}; the avatar's address answered ${bNewAvatar.status} → ${short(bNewAvatar.location)}; the logo's ${bNewLogo.status} → ${short(bNewLogo.location)}`,
  )
  await b.proc.stop()

  // ══ C. THE DOMAIN LEFT ON THE PRIVATE BUCKET ═════════════════════════════
  console.log('\n▶ C. R2_PUBLIC_BUCKET_NAME set, but R2_PUBLIC_URL still on the private bucket — an upgrade done half way')
  const c = await startApi('C', { R2_PUBLIC_BUCKET_NAME: PICTURES, R2_PUBLIC_URL: PRIVATE_DOMAIN })
  const cAvatar = await signedPicture(c.base, fresh.avatar, PICTURES)
  const cLogo = await signedPicture(c.base, fresh.logo, PICTURES)
  chk(
    cAvatar.ok && cLogo.ok,
    'where the pictures have a bucket of their own but the domain was left on the private one, the API sees it when it starts and sends nobody there: a picture\'s address is signed, from the pictures\' bucket, and still loads',
    `the avatar's address answered ${cAvatar.status} → ${short(cAvatar.location)}; the logo's ${cLogo.status} → ${short(cLogo.location)}`,
  )
  const cSaid = await waitUntil(() => c.said().some((l) => l.includes(`R2_PUBLIC_URL (${PRIVATE_DOMAIN}) serves the objects of R2_BUCKET_NAME (${BUCKET})`)), { timeoutMs: 5_000 })
  const cLine = c.said().find((l) => l.includes('R2_PUBLIC_URL')) ?? ''
  chk(
    cSaid && /\bERROR\b/.test(cLine) && cLine.includes(`Connect the domain to R2_PUBLIC_BUCKET_NAME (${PICTURES}) alone`),
    'and says so, as an error: the domain serves the private bucket, and belongs on the pictures\' bucket alone',
    `it said ${short(cLine || c.said().slice(-3).join(' | '))}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (!sql) sql = await openDb().catch(() => null)
  if (sql && userId) {
    /*
     * What signing up made: an organization of this person's own with its
     * workspace (and so its space, list, task, channel and meeting) — only one
     * nobody else belongs to — then their memberships and the account.
     */
    await sql`
      delete from organizations o
      where o.id in (select organization_id from organization_members where user_id = ${userId})
        and not exists (select 1 from organization_members m where m.organization_id = o.id and m.user_id <> ${userId})`
      .catch((e) => console.log(`  cleanup left behind: the organization of ${userId} (${e.message})`))
    await sql`delete from workspace_members where user_id = ${userId}`
      .catch((e) => console.log(`  cleanup left behind: the memberships of ${userId} (${e.message})`))
    await sql`delete from users where id = ${userId}`
      .catch((e) => console.log(`  cleanup left behind: the account ${userId} (${e.message})`))
  }
  await sql?.end({ timeout: 5 }).catch(() => {})
  // The APIs before their store, so nothing one holds is asked of a store that has gone.
  for (const proc of [...started].reverse()) await proc.stop().catch(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  // The exit code, not an exit: the API and the store were stopped above, and
  // nothing else holds the run open.
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
