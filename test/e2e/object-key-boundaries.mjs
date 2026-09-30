/**
 * THE KEYS A CLIENT HANDS BACK — chat attachments, custom emoji, call
 * recordings, a meeting's recording pointer and clips. Each is an object key
 * the server signs into a working URL (or deletes), so each is a way to read
 * any object in the bucket unless the key is proven to be the caller's own.
 *
 * NOT A FRAME ROW. Three open-work items and what was found beside them:
 *
 *   · `POST /chat/channels/:id/attachments` recorded ANY `storageKey` and
 *     signed it straight back;
 *   · custom emoji and call recordings checked a PREFIX, which `..` walks out
 *     of on a public-CDN deployment (`getObjectUrl` returns the key unencoded
 *     and a browser collapses dot segments);
 *   · a meeting's `recordingUrl` with no scheme was signed whatever it named,
 *     anything containing `://` — `javascript://` included — came back as a
 *     link, and the AI page's meeting card wrote the fifteen-minute signed URL
 *     back over the durable key on every Update;
 *   · a clip's share and delete checked a prefix too: sharing the walk handed
 *     back a link that served another workspace's file, and deleting it
 *     removed that file from the store (§5, measured on a lane).
 *
 * The rule now is one module, `object-key-shape.ts`: a key is ours when it is
 * our prefix plus ONE segment in the sanitisers' alphabet. Every refusal here
 * is checked by status AND by the row; every rule has a positive twin; and the
 * read side is checked against rows poisoned by SQL, each beside a legitimate
 * one that must still sign.
 *
 * NEEDS THE OBJECT STORE — the positive twins PUT real bytes and read them back.
 *
 *   node test/e2e/object-key-boundaries.mjs --api 3021
 */
import { signInApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 23

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`);
 * like the copy, it throws when nothing answers at all. */
const apiAs = apiAsAt(API, { noAnswer: 'throw' })
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? res.data ?? null).slice(0, 160)}`

/** PUT bytes to a presigned URL; the status, or 0 when nothing answered. */
const put = (url, bytes, type) =>
  fetch(url, { method: 'PUT', headers: { 'content-type': type }, body: bytes }).then((r) => r.status, () => 0)
/** The bytes a URL serves, or null. */
const bytesAt = (url) =>
  typeof url === 'string' && /^https?:\/\//.test(url)
    ? fetch(url).then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null), () => null)
    : Promise.resolve(null)

const stamp = Date.now()
const TAG = `okb-${stamp}`
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARgwMDAwMAA8IAWYAAAAASUVORK5CYII=',
  'base64',
)
const cleanup = []
let sql = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — every refusal here is checked against the row, not the status alone')

  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const WA = await make('/workspaces', { name: `${TAG} A` }, 'workspace A')
  cleanup.push(() => A(`/workspaces/${WA}`, { method: 'DELETE' }))
  const WB = await make('/workspaces', { name: `${TAG} B` }, 'workspace B')
  cleanup.push(() => A(`/workspaces/${WB}`, { method: 'DELETE' }))
  // An object of B's, in exactly the shape B's own presign would mint.
  const FOREIGN = `workspaces/${WB}/tasks/00000000-0000-0000-0000-000000000000/attachments/${stamp}-secret.pdf`

  // ══ 1. CHAT ATTACHMENTS ══════════════════════════════════════════════════
  console.log('\n▶ a chat attachment is an upload this channel presigned, and nothing else')

  const CH = await make(`/workspaces/${WA}/chat/channels`, { name: `okb-${stamp}` }, 'the channel')
  const attachmentRows = async (key) =>
    (await sql`select id from chat_message_attachments where channel_id = ${CH} and storage_key = ${key}`).length

  const foreignAttach = await A(`/chat/channels/${CH}/attachments`, {
    method: 'POST',
    body: { fileName: 'secret.pdf', contentType: 'application/pdf', sizeBytes: 10, storageKey: FOREIGN },
  })
  chk(
    foreignAttach.status === 400 && (await attachmentRows(FOREIGN)) === 0 && !foreignAttach.data?.url,
    'another workspace’s key is refused, not recorded, and no URL comes back for it',
    `it answered ${said(foreignAttach)}; ${await attachmentRows(FOREIGN)} row(s) hold it — this took any key and signed it straight back`,
  )

  const WALK = `chat/${CH}/attachments/../../../${FOREIGN}`
  const walkAttach = await A(`/chat/channels/${CH}/attachments`, {
    method: 'POST',
    body: { fileName: 'secret.pdf', contentType: 'application/pdf', sizeBytes: 10, storageKey: WALK },
  })
  chk(
    walkAttach.status === 400 && (await attachmentRows(WALK)) === 0,
    'and so is one that starts with this channel’s own prefix and walks out of it',
    `it answered ${said(walkAttach)} and ${await attachmentRows(WALK)} row(s) hold it`,
  )

  const chatPresign = await A(`/chat/channels/${CH}/attachments/presign`, {
    method: 'POST',
    body: { fileName: `${stamp}-own.png`, contentType: 'image/png', sizeBytes: PNG.length },
  })
  const chatPut = chatPresign.data?.uploadUrl ? await put(chatPresign.data.uploadUrl, PNG, 'image/png') : 0
  const ownAttach = chatPresign.data?.storageKey
    ? await A(`/chat/channels/${CH}/attachments`, {
        method: 'POST',
        body: { fileName: 'own.png', contentType: 'image/png', sizeBytes: PNG.length, storageKey: chatPresign.data.storageKey },
      })
    : { status: 0 }
  const ownBytes = await bytesAt(ownAttach.data?.url)
  chk(
    ownAttach.status < 300 && ownBytes !== null && ownBytes.equals(PNG),
    'while this channel’s own upload is recorded, and its URL serves the bytes that were put',
    `presign ${chatPresign.status}, PUT ${chatPut}, record ${said(ownAttach)}; the URL served ` +
      `${ownBytes === null ? 'nothing' : `${ownBytes.length} other byte(s)`}`,
  )

  // Read side: one message carries the legitimate attachment, another a
  // foreign key written by SQL — before the check, or by any later path.
  const ownMsg = await A(`/chat/channels/${CH}/messages`, {
    method: 'POST',
    body: { body: `${TAG} own`, attachmentIds: ownAttach.data?.id ? [ownAttach.data.id] : [] },
  })
  const poisonedMsg = await A(`/chat/channels/${CH}/messages`, { method: 'POST', body: { body: `${TAG} poisoned` } })
  if (poisonedMsg.data?.id) {
    await sql`insert into chat_message_attachments (channel_id, message_id, file_name, content_type, size_bytes, storage_key, uploaded_by_id)
      values (${CH}, ${poisonedMsg.data.id}, 'secret.pdf', 'application/pdf', 10, ${FOREIGN}, (select id from users where email = ${ADMIN.email}))`
  }
  const listed = (await A(`/chat/channels/${CH}/messages`)).data
  const messages = Array.isArray(listed) ? listed : listed?.messages ?? listed?.items ?? []
  const urlsOf = (id) => (messages.find((m) => m.id === id)?.attachments ?? []).map((a) => a.url ?? null)
  chk(
    urlsOf(poisonedMsg.data?.id).length === 1 && urlsOf(poisonedMsg.data?.id)[0] === null &&
      typeof urlsOf(ownMsg.data?.id)[0] === 'string',
    'a foreign key already sitting in the table is not signed on read — while the channel’s own still is',
    `the poisoned message's attachment URLs are ${JSON.stringify(urlsOf(poisonedMsg.data?.id)).slice(0, 120)}; ` +
      `the legitimate one's ${JSON.stringify(urlsOf(ownMsg.data?.id)).slice(0, 80)}`,
  )

  // ══ 2. CUSTOM EMOJI ══════════════════════════════════════════════════════
  console.log('\n▶ an uploaded emoji is this workspace’s own upload, by shape')

  const emojiRows = async (key) => (await sql`select id from chat_custom_emoji where workspace_id = ${WA} and storage_key = ${key}`).length
  const EMOJI_WALK = `chat/${WA}/emoji/../../../${FOREIGN}`
  const walkEmoji = await A(`/chat/workspaces/${WA}/custom-emoji`, {
    method: 'POST',
    body: { shortcode: `walk_${stamp % 100000}`, storageKey: EMOJI_WALK },
  })
  chk(
    walkEmoji.status === 400 && (await emojiRows(EMOJI_WALK)) === 0,
    'an emoji key that starts with the workspace’s prefix and walks out of it is refused — the prefix check let it in',
    `it answered ${said(walkEmoji)} and ${await emojiRows(EMOJI_WALK)} row(s) hold it`,
  )

  const emojiPresign = await A(`/chat/workspaces/${WA}/custom-emoji/presign`, {
    method: 'POST',
    body: { fileName: `${stamp}-e.png`, contentType: 'image/png', sizeBytes: PNG.length },
  })
  const emojiPut = emojiPresign.data?.uploadUrl ? await put(emojiPresign.data.uploadUrl, PNG, 'image/png') : 0
  const OWN_CODE = `own_${stamp % 100000}`
  const ownEmoji = emojiPresign.data?.storageKey
    ? await A(`/chat/workspaces/${WA}/custom-emoji`, {
        method: 'POST',
        body: { shortcode: OWN_CODE, storageKey: emojiPresign.data.storageKey },
      })
    : { status: 0 }
  const emojiBytes = await bytesAt(ownEmoji.data?.imageUrl)
  chk(
    ownEmoji.status < 300 && emojiBytes !== null && emojiBytes.equals(PNG),
    'while the workspace’s own upload becomes an emoji whose image serves its bytes',
    `presign ${emojiPresign.status}, PUT ${emojiPut}, add ${said(ownEmoji)}`,
  )

  const POISON_CODE = `poison_${stamp % 100000}`
  await sql`insert into chat_custom_emoji (workspace_id, shortcode, image_url, storage_key)
    values (${WA}, ${POISON_CODE}, '', ${FOREIGN})`
  const emojiList = (await A(`/chat/workspaces/${WA}/custom-emoji`)).data ?? []
  const imageOf = (code) => emojiList.find((e) => e.shortcode === code)?.imageUrl
  chk(
    emojiList.some((e) => e.shortcode === POISON_CODE) && !imageOf(POISON_CODE) && typeof imageOf(OWN_CODE) === 'string',
    'and an emoji whose key names another workspace’s object draws nothing — while the workspace’s own still draws',
    `the poisoned emoji's image is ${JSON.stringify(imageOf(POISON_CODE) ?? null).slice(0, 120)}; the legitimate one's ` +
      `${JSON.stringify(imageOf(OWN_CODE) ?? null).slice(0, 60)}`,
  )

  // ══ 3. A MEETING'S RECORDING ═════════════════════════════════════════════
  console.log('\n▶ a meeting’s recording is a pasted link, or a recording of one of this workspace’s calls')

  const meetingRow = async (title) => (await sql`select id, recording_url from meetings where workspace_id = ${WA} and title = ${title}`)[0] ?? null
  const KEYED = `${TAG} keyed`
  const keyed = await A(`/workspaces/${WA}/meetings`, { method: 'POST', body: { title: KEYED, recordingUrl: FOREIGN } })
  chk(
    keyed.status === 400 && (await meetingRow(KEYED)) === null,
    'a client cannot store a bare key as a recording — keys are written by the server',
    `it answered ${said(keyed)}; this used to store it and then sign it for anybody who opened the meeting`,
  )

  const SCRIPTED = `${TAG} scripted`
  const scripted = await A(`/workspaces/${WA}/meetings`, { method: 'POST', body: { title: SCRIPTED, recordingUrl: 'javascript://%0aalert(1)' } })
  chk(
    scripted.status === 400 && (await meetingRow(SCRIPTED)) === null,
    'nor a link in any scheme but http(s)',
    `it answered ${said(scripted)}`,
  )

  const LINKED = `${TAG} linked`
  const PASTED = `https://recordings.example.com/${stamp}?t=1`
  const linked = await A(`/workspaces/${WA}/meetings`, { method: 'POST', body: { title: LINKED, recordingUrl: PASTED } })
  chk(
    linked.status < 300 && (await meetingRow(LINKED))?.recording_url === PASTED && linked.data?.recordingUrl === PASTED,
    'while a pasted https link is stored and handed back exactly as it was pasted',
    `it answered ${said(linked)} and stored ${JSON.stringify((await meetingRow(LINKED))?.recording_url ?? null)}`,
  )

  /*
   * THE ROUND TRIP. A meeting whose pointer is one of this workspace's call
   * recordings — written by SQL in exactly the shape the recording presign
   * mints, since the server is the only legitimate writer. Its GET hands out a
   * signed URL; the AI card sends that URL back with an edit; the stored value
   * must still be the KEY, or the recording dies fifteen minutes later.
   */
  const ROUND = `${TAG} round trip`
  const round = await A(`/workspaces/${WA}/meetings`, { method: 'POST', body: { title: ROUND } })
  const CALL_KEY = `calls/${WA}/11111111-1111-1111-1111-111111111111/recording-${stamp}.webm`
  if (round.data?.id) await sql`update meetings set recording_url = ${CALL_KEY} where id = ${round.data.id}`
  const handedOut = round.data?.id ? (await A(`/workspaces/${WA}/meetings/${round.data.id}`)).data?.recordingUrl : null
  const edited = round.data?.id && handedOut
    ? await A(`/workspaces/${WA}/meetings/${round.data.id}`, { method: 'PATCH', body: { notes: 'edited', recordingUrl: handedOut } })
    : { status: 0 }
  chk(
    typeof handedOut === 'string' && /^https?:\/\//.test(handedOut) && edited.status < 300 &&
      (await meetingRow(ROUND))?.recording_url === CALL_KEY,
    'the signed URL a meeting hands out, sent back with an edit, leaves the durable key in place',
    `the GET handed out ${JSON.stringify(handedOut ?? null).slice(0, 80)}; the edit answered ${said(edited)} and the ` +
      `column now holds ${JSON.stringify((await meetingRow(ROUND))?.recording_url ?? null).slice(0, 100)}`,
  )

  // A URL of our own bucket naming some OTHER object is the same attack as a
  // bare key, spelled as a link. Built from the URL just handed out, so the
  // suite does not have to know the bucket's name.
  let ownBucketForeign = null
  try {
    const u = new URL(handedOut)
    const bucket = u.pathname.split('/').filter(Boolean)[0]
    ownBucketForeign = `${u.origin}/${bucket}/${FOREIGN}`
  } catch {}
  const repointed = ownBucketForeign && linked.data?.id
    ? await A(`/workspaces/${WA}/meetings/${linked.data.id}`, { method: 'PATCH', body: { recordingUrl: ownBucketForeign } })
    : { status: 0 }
  chk(
    repointed.status === 400 && (await meetingRow(LINKED))?.recording_url === PASTED,
    'and a URL of this deployment’s own bucket naming any other object is refused — a key spelled as a link',
    ownBucketForeign
      ? `it answered ${said(repointed)} and the column holds ${JSON.stringify((await meetingRow(LINKED))?.recording_url ?? null).slice(0, 100)}`
      : 'no signed URL was handed out to build the attempt from, so this could not be tried',
  )

  const P1 = `${TAG} poisoned key`
  const P2 = `${TAG} poisoned scheme`
  await sql`insert into meetings (workspace_id, title, provider, recording_url, created_by_id)
    values (${WA}, ${P1}, 'manual', ${FOREIGN}, (select id from users where email = ${ADMIN.email})),
           (${WA}, ${P2}, 'manual', 'javascript://%0aalert(1)', (select id from users where email = ${ADMIN.email}))`
  const all = (await A(`/workspaces/${WA}/meetings`)).data ?? []
  const recOf = (title) => all.find((m) => m.title === title)?.recordingUrl
  chk(
    all.some((m) => m.title === P1) && recOf(P1) == null && recOf(P2) == null && typeof recOf(ROUND) === 'string',
    'a meeting whose stored pointer is another workspace’s key, or a script, hands out no link — while a call recording of its own does',
    `the foreign key came back as ${JSON.stringify(recOf(P1) ?? null).slice(0, 100)}, the script as ` +
      `${JSON.stringify(recOf(P2) ?? null)}, the legitimate recording as ${JSON.stringify(recOf(ROUND) ?? null).slice(0, 60)}`,
  )

  // ══ 4. A CALL'S RECORDING ════════════════════════════════════════════════
  console.log('\n▶ a call attaches exactly the recording its presign minted')

  const call = await A(`/workspaces/${WA}/calls`, { method: 'POST', body: { title: `${TAG} call` } })
  const CALL = call.data?.id ?? call.data?.call?.id ?? null
  if (CALL) cleanup.push(() => A(`/workspaces/${WA}/calls/${CALL}/end`, { method: 'POST' }))
  const recordingRows = async (key) => (await sql`select id from call_recordings where call_id = ${CALL} and storage_key = ${key}`).length
  const CALL_WALK = `calls/${WA}/${CALL}/../../${WB}/${CALL}/recording-1.webm`
  const walkRecording = CALL
    ? await A(`/workspaces/${WA}/calls/${CALL}/recording/attach`, { method: 'POST', body: { storageKey: CALL_WALK } })
    : { status: 0 }
  chk(
    walkRecording.status === 400 && CALL !== null && (await recordingRows(CALL_WALK)) === 0,
    'a recording key that starts with the call’s prefix and walks out of it is refused — the prefix check let it in',
    CALL ? `it answered ${said(walkRecording)} and ${await recordingRows(CALL_WALK)} row(s) hold it` : `no call could be started: ${said(call)}`,
  )

  // A recording exists only once recording was switched on — the product's own
  // gate on upload-url ("this call was never recorded"), so the suite goes the
  // same way a caller does: on, and off, then ask where to put the file.
  if (CALL) {
    await A(`/workspaces/${WA}/calls/${CALL}/recording`, { method: 'POST', body: { recording: true } })
    await A(`/workspaces/${WA}/calls/${CALL}/recording`, { method: 'POST', body: { recording: false } })
  }
  const upload = CALL ? await A(`/workspaces/${WA}/calls/${CALL}/recording/upload-url`, { method: 'POST', body: { contentType: 'audio/webm' } }) : { status: 0 }
  const REC_KEY = upload.data?.storageKey ?? null
  const attached = REC_KEY
    ? await A(`/workspaces/${WA}/calls/${CALL}/recording/attach`, { method: 'POST', body: { storageKey: REC_KEY } })
    : { status: 0 }
  chk(
    attached.status < 300 && REC_KEY !== null && (await recordingRows(REC_KEY)) === 1,
    'while the key the call’s own presign minted is attached',
    `upload-url answered ${said(upload)}; attaching answered ${said(attached)}`,
  )

  // ══ 5. CLIPS ═════════════════════════════════════════════════════════════
  console.log('\n▶ a clip is one of this workspace’s clips, by shape — to share it, attach it to a task, and delete it')

  /*
   * A REAL OBJECT OF B'S THIS TIME, because the delete is the harm and a key
   * with nothing behind it cannot show it: a task attachment, uploaded the way
   * B's own members upload one, read back through B's own attachment list.
   */
  const inB = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what} in B: ${said(res)}`)
    return res.data.id
  }
  const bSpace = await inB('/spaces', { workspaceId: WB, name: `${TAG} space` }, 'a space')
  const bProject = await inB('/projects', { spaceId: bSpace, name: `${TAG} project` }, 'a project')
  const bList = await inB('/lists', { projectId: bProject, name: `${TAG} list` }, 'a list')
  const bTask = await inB('/tasks', { listId: bList, title: `${TAG} holds B’s file` }, 'a task')
  const SECRET = Buffer.from(`${TAG} — workspace B's file`)
  const bPresign = await A(`/tasks/${bTask}/attachments/presign`, {
    method: 'POST',
    body: { fileName: 'secret.pdf', contentType: 'application/pdf', sizeBytes: SECRET.length },
  })
  const bPut = bPresign.data?.uploadUrl ? await put(bPresign.data.uploadUrl, SECRET, 'application/pdf') : 0
  const bRecord = bPresign.data?.storageKey
    ? await A(`/tasks/${bTask}/attachments`, {
        method: 'POST',
        body: { fileName: 'secret.pdf', storageKey: bPresign.data.storageKey, contentType: 'application/pdf', sizeBytes: SECRET.length },
      })
    : { status: 0 }
  if (bPut !== 200 || bRecord.status >= 300) throw new Error(`could not plant B's file: PUT ${bPut}, record ${said(bRecord)}`)
  const B_OBJECT = bPresign.data.storageKey
  /** B's file, read the way B reads it; null once it is gone. */
  const bFileNow = async () => {
    const rows = (await A(`/tasks/${bTask}/attachments`)).data ?? []
    return bytesAt(rows.find((r) => r.storageKey === B_OBJECT)?.url)
  }
  const CLIP_WALK = `workspaces/${WA}/clips/../../../${B_OBJECT}`

  /*
   * A SHARE ANSWERS WITH THE CLIP'S LINK, `/clips/<token>`, and no longer with
   * a signed URL (`resume-defects/resume-7`). What a link serves is what
   * opening it answers, `GET /public/clips/<token>`, signed at that moment.
   */
  const servedBy = async (res) => {
    if (!res.data?.token) return null
    const opened = await apiAs(null)(`/public/clips/${res.data.token}`)
    return bytesAt(opened.data?.url)
  }
  const walkShare = await A(`/workspaces/${WA}/clips/share`, { method: 'POST', body: { storageKey: CLIP_WALK, mode: 'public' } })
  const walkServed = await servedBy(walkShare)
  chk(
    walkShare.status === 400 && !walkShare.data?.shareUrl && !walkShare.data?.token,
    'a clip key that starts with the workspace’s clips and walks out of them is not shared — no link comes back for it',
    `it answered ${said(walkShare)}${walkServed ? `, and the link served ${walkServed.equals(SECRET) ? 'workspace B’s file' : `${walkServed.length} byte(s)`}` : ''}`,
  )

  const CLIP = Buffer.from(`${TAG} — A's own clip`)
  const clipPresign = await A(`/workspaces/${WA}/clips/presign`, {
    method: 'POST',
    body: { fileName: `${stamp}-own.webm`, contentType: 'video/webm', title: `${TAG} own clip` },
  })
  const clipPut = clipPresign.data?.uploadUrl ? await put(clipPresign.data.uploadUrl, CLIP, 'video/webm') : 0
  const OWN_CLIP = clipPresign.data?.storageKey ?? null
  const ownShare = OWN_CLIP
    ? await A(`/workspaces/${WA}/clips/share`, { method: 'POST', body: { storageKey: OWN_CLIP, mode: 'public' } })
    : { status: 0 }
  const ownShared = await servedBy(ownShare)
  chk(
    ownShare.status < 300 && ownShared !== null && ownShared.equals(CLIP),
    'while the workspace’s own clip is shared, and its link serves the clip',
    `presign ${said(clipPresign)}, PUT ${clipPut}, share ${said(ownShare)}; the link served ` +
      `${ownShared === null ? 'nothing' : `${ownShared.length} other byte(s)`}`,
  )

  /*
   * A TASK ATTACHES A CLIP BY COPYING IT (Create a task on the clip card), so
   * the attach route is one more place a client hands back a clip key. It
   * copies whatever it is given into the task, where the task's own list signs
   * it: the walk here would put B's file on A's task.
   */
  const inA = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what} in A: ${said(res)}`)
    return res.data.id
  }
  const aSpace = await inA('/spaces', { workspaceId: WA, name: `${TAG} space` }, 'a space')
  const aProject = await inA('/projects', { spaceId: aSpace, name: `${TAG} project` }, 'a project')
  const aList = await inA('/lists', { projectId: aProject, name: `${TAG} list` }, 'a list')
  const aTask = await inA('/tasks', { listId: aList, title: `${TAG} made from a clip` }, 'a task')
  const aTaskFiles = async () => sql`select storage_key from task_attachments where task_id = ${aTask}`

  const walkClipAttach = await A(`/tasks/${aTask}/attachments/from-clip`, { method: 'POST', body: { storageKey: CLIP_WALK } })
  const afterWalk = await aTaskFiles()
  chk(
    walkClipAttach.status === 400 && afterWalk.length === 0,
    'a task cannot attach a key that walks out of its workspace’s clips — refused, and nothing is attached',
    `it answered ${said(walkClipAttach)}; the task holds ${afterWalk.length} file(s)`,
  )

  const ownClipAttach = OWN_CLIP
    ? await A(`/tasks/${aTask}/attachments/from-clip`, { method: 'POST', body: { storageKey: OWN_CLIP, fileName: 'own clip.webm' } })
    : { status: 0 }
  const attachedBytes = await bytesAt(ownClipAttach.data?.url)
  const afterOwn = await aTaskFiles()
  chk(
    ownClipAttach.status < 300 && attachedBytes !== null && attachedBytes.equals(CLIP) && afterOwn.length === 1 &&
      afterOwn[0].storage_key.startsWith(`workspaces/${WA}/tasks/${aTask}/attachments/`),
    'while one of the workspace’s own clips is attached as the task’s own copy, which serves the clip',
    `attach answered ${said(ownClipAttach)}; the task holds ${JSON.stringify(afterOwn.map((r) => r.storage_key)).slice(0, 160)}; ` +
      `its URL served ${attachedBytes === null ? 'nothing' : `${attachedBytes.length} byte(s)`}`,
  )

  const walkRemove = await A(`/workspaces/${WA}/clips`, { method: 'DELETE', body: { storageKey: CLIP_WALK } })
  const bAfter = await bFileNow()
  chk(
    walkRemove.status === 400 && bAfter !== null && bAfter.equals(SECRET),
    'and deleting that key is refused, with workspace B’s file still there afterwards',
    `it answered ${said(walkRemove)}; B's file ${bAfter === null ? 'is GONE — the walk deleted it' : 'is still there'}`,
  )

  const libraryHas = async (key) => ((await A(`/workspaces/${WA}/clips`)).data ?? []).some((c) => c.storageKey === key)
  const listedBefore = OWN_CLIP ? await libraryHas(OWN_CLIP) : false
  const ownRemove = OWN_CLIP
    ? await A(`/workspaces/${WA}/clips`, { method: 'DELETE', body: { storageKey: OWN_CLIP } })
    : { status: 0 }
  const listedAfter = OWN_CLIP ? await libraryHas(OWN_CLIP) : true
  chk(
    listedBefore && ownRemove.status < 300 && !listedAfter,
    'while the workspace’s own clip is deleted, and leaves the library',
    `the library ${listedBefore ? 'listed' : 'did not list'} it; delete answered ${said(ownRemove)}; ` +
      `afterwards it is ${listedAfter ? 'still listed' : 'gone'}`,
  )

  // ══ 6. THE NAME IN THE KEY ═══════════════════════════════════════════════
  console.log('\n▶ an upload with no file name is given a safe one, on every route that names an object')

  /*
   * `sanitize-filename-deref-before-fallback`. The name rule was four private
   * copies, and three called `.replace` before their `|| 'file'`, so a request
   * with no `fileName` answered 500 on five routes (measured on lane 1). One
   * rule now, `common/storage/file-name.ts`: the guarded copy forms already had.
   */
  const lastSegment = (key) => String(key ?? '').split('/').pop() ?? ''
  const unnamed = [
    ['a task attachment presign', await A(`/tasks/${aTask}/attachments/presign`, { method: 'POST', body: { contentType: 'image/png', sizeBytes: PNG.length } })],
    ['a clip presign', await A(`/workspaces/${WA}/clips/presign`, { method: 'POST', body: { contentType: 'video/webm' } })],
    ['a chat attachment presign', await A(`/chat/channels/${CH}/attachments/presign`, { method: 'POST', body: { contentType: 'image/png', sizeBytes: PNG.length } })],
    ['a custom emoji presign', await A(`/chat/workspaces/${WA}/custom-emoji/presign`, { method: 'POST', body: { contentType: 'image/png', sizeBytes: PNG.length } })],
  ]
  const misnamed = unnamed.filter(([, r]) => !(r.status < 300 && /^\d+-(file|clip\.webm)$/.test(lastSegment(r.data?.storageKey))))
  // And the chat record, where the name is the one shown on the attachment.
  const recPresign = await A(`/chat/channels/${CH}/attachments/presign`, {
    method: 'POST',
    body: { fileName: `${stamp}-rec.png`, contentType: 'image/png', sizeBytes: PNG.length },
  })
  const recPut = recPresign.data?.uploadUrl ? await put(recPresign.data.uploadUrl, PNG, 'image/png') : 0
  const unnamedRecord = recPresign.data?.storageKey
    ? await A(`/chat/channels/${CH}/attachments`, {
        method: 'POST',
        body: { storageKey: recPresign.data.storageKey, contentType: 'image/png', sizeBytes: PNG.length },
      })
    : { status: 0 }
  chk(
    misnamed.length === 0 && unnamedRecord.status < 300 && unnamedRecord.data?.fileName === 'file',
    'an upload with no file name is given a safe one on every route that names an object — not a 500',
    `${misnamed.map(([what, r]) => `${what} answered ${said(r)}`).join('; ') || 'every presign named its key'}; ` +
      `the chat record (PUT ${recPut}) answered ${said(unnamedRecord)}`,
  )

  const named = await A(`/tasks/${aTask}/attachments/presign`, {
    method: 'POST',
    body: { fileName: 'Q3 report (final).pdf', contentType: 'application/pdf', sizeBytes: 10 },
  })
  chk(
    named.status < 300 && /^\d+-Q3_report__final_\.pdf$/.test(lastSegment(named.data?.storageKey)),
    'while a named file keeps its name, made safe for the key',
    `the presign answered ${said(named)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  for (const fn of cleanup.reverse()) {
    const res = await fn().catch((e) => ({ status: 0, error: String(e?.message ?? e) }))
    if (res.status === 0 || res.status >= 300) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${said(res)}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
