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
 * copy from the library, made by the API: see `attachClipToTask`.
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

/**
 * A link to an uploaded clip.
 *
 * `mode: 'public'` is the frame's "Copy link": a signed URL anybody holding it
 * can open. The server caps the expiry at seven days and defaults to an hour;
 * a day is asked for here because "copy a link and paste it to a colleague" is
 * not an operation that should stop working over lunch.
 */
export async function clipShareUrl(workspaceId: string, storageKey: string): Promise<string> {
  const { shareUrl } = await api<{ shareUrl: string }>(
    `/workspaces/${workspaceId}/clips/share`,
    { method: 'POST', body: { storageKey, mode: 'public', expiresInMinutes: 60 * 24 } },
  )
  return shareUrl
}
