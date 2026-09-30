/**
 * Putting a recorded clip somewhere it can be linked to.
 *
 * §V2-S05 frames `05:25`–`05:30` — the "Clip created!" card offers **Create a
 * task · New tab · Copy link**, and the last one confirms "Link copied". Two of
 * those three need a URL, and a freshly recorded clip does not have one: in the
 * composer it is a `Blob` behind an object URL, which is private to the
 * document that made it. Copying a `blob:` link would produce something that
 * works in that tab and nowhere else — the neatest facade on offer here.
 *
 * SO THE CLIP HAS TO BE UPLOADED, and this is where. `POST /clips/presign` then
 * a PUT to storage is exactly what the clips page already did; that page's
 * uploader lived at the bottom of its own file, unexported, so it is MOVED here
 * rather than copied. The clips page imports it now.
 *
 * WHEN, and this is a real decision rather than a detail: LAZILY, on the first
 * of the three actions that is pressed. Uploading the moment the card appears would spend
 * somebody's bandwidth on a clip they are about to discard, and cleaning that
 * up means a second call (`DELETE /clips`) that can itself fail and leave an
 * orphan in storage. The frames do show a spinner — at `05:35`, on the clip
 * already IN a comment, which is a later moment and not an argument for
 * uploading before anybody asked.
 *
 * `Attach clip` is untouched and still stages the file for the comment, so the
 * ordinary path uploads once, as an attachment, when the comment is posted. A
 * clip only reaches the clips library if somebody asks for a link to it, or
 * for a task made from it (ClickUp saves every clip to its Clips Hub; this
 * saves the ones somebody did something with). The task then gets its own
 * copy from the library, made by the API: see `attachClipToTask`. The link is
 * the clip's own and does not expire: see `clipLink`.
 */
import { api } from './api'

/**
 * PUT a blob at a presigned URL, reporting progress.
 *
 * Moved verbatim from `workspace-clips-page.tsx`, where it was a module-local
 * function. XHR rather than `fetch` for one reason: upload progress. `fetch`
 * still cannot report it, and a clip is big enough that a silent wait reads as
 * a hang.
 */
export async function uploadBlobWithProgress(args: {
  url: string
  blob: Blob
  contentType: string
  onProgress: (percent: number) => void
  networkErrorMessage?: string
}): Promise<{ ok: boolean; status: number; statusText: string; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', args.url, true)
    xhr.setRequestHeader('Content-Type', args.contentType)
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      const percent = Math.round((event.loaded / event.total) * 100)
      args.onProgress(Math.min(100, Math.max(0, percent)))
    }
    xhr.onerror = () =>
      reject(new Error(args.networkErrorMessage ?? 'Network error while uploading clip'))
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        statusText: xhr.statusText,
        responseText: xhr.responseText,
      })
    }
    xhr.send(args.blob)
  })
}

/** Upload a recording to the workspace's clips, and answer with its key. */
export async function publishClip(args: {
  workspaceId: string
  file: File
  title: string
  durationSeconds?: number
  onProgress?: (percent: number) => void
}): Promise<string> {
  const contentType = args.file.type || 'video/webm'
  const presign = await api<{ uploadUrl: string; storageKey: string }>(
    `/workspaces/${args.workspaceId}/clips/presign`,
    {
      method: 'POST',
      body: {
        fileName: args.file.name,
        contentType,
        durationSeconds: args.durationSeconds,
        title: args.title,
      },
    },
  )
  const put = await uploadBlobWithProgress({
    url: presign.uploadUrl,
    blob: args.file,
    contentType,
    onProgress: args.onProgress ?? (() => {}),
  })
  /*
   * A failed PUT must throw. Returning the key anyway would hand back a link to
   * an object that is not there — and the person would only find out when they
   * sent it to somebody.
   */
  if (!put.ok) {
    throw new Error(`clip upload failed (${put.status} ${put.statusText})`)
  }
  return presign.storageKey
}

/**
 * §V2-S05 frame `05:25`: Create a task attaches the clip. The task gets its
 * own copy of the uploaded clip, made by the API inside the bucket, so nothing
 * is uploaded twice. It is signed whenever the task is read, where a link
 * pasted into the description stopped working after a day.
 */
export async function attachClipToTask(taskId: string, storageKey: string, fileName: string): Promise<void> {
  await api(`/tasks/${taskId}/attachments/from-clip`, {
    method: 'POST',
    body: { storageKey, fileName },
  })
}

/** Who a clip's link opens for: anyone holding it, or its workspace's members, signed in. */
export type ClipLinkAudience = 'anyone' | 'members'

export type ClipLink = {
  token: string
  /** `/clips/<token>` — the app route, which signs the clip again on every view. */
  path: string
  audience: ClipLinkAudience
  /** The path on this site: what Copy link copies and New tab opens. */
  url: string
}

/**
 * THE CLIP'S LINK (`resume-defects/resume-7`).
 *
 * This was a signed storage URL, asked for a day, and the toast said only
 * "Link copied": a link pasted into a chat or a doc that died the next day.
 * ClickUp's clip URL is an unguessable string that anyone with it can open,
 * kept until the clip is deleted. So the link is the app's `/clips/<token>`,
 * the same one every time it is asked for, and opening it signs the clip
 * again; nothing here has an expiry to ask for or to state. `audience` is who
 * it opens for, which the toast and the share dialog say out loud.
 *
 * On THIS site's origin: the server builds an email's link from its own
 * `APP_URL`, which need not be the address the person is using.
 */
export async function clipLink(workspaceId: string, storageKey: string): Promise<ClipLink> {
  const made = await api<Omit<ClipLink, 'url'>>(`/workspaces/${workspaceId}/clips/link`, {
    method: 'POST',
    body: { storageKey },
  })
  return { ...made, url: `${window.location.origin}${made.path}` }
}
