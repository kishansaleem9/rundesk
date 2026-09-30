/**
 * WHICH STORAGE KEYS BELONG TO A TASK — and why the answer is a shape, not a
 * prefix.
 *
 * A task's objects are written by exactly three code paths, in two shapes:
 *
 *   workspaces/<ws>/tasks/<task>/attachments/<Date.now()>-<name>
 *       createAttachmentUploadUrl (uploads, and the cover picker's Upload tab,
 *       which presigns through the same route) and the ClickUp importer;
 *
 *   inbound-email/<task>/<Date.now()>-<name>
 *       email-to-task, for attachments that arrive on a mailed-in task.
 *
 * All three sanitise `<name>` to `[a-zA-Z0-9._-]`, so the last segment can
 * never contain a slash.
 *
 * THE PREFIX CHECK THIS REPLACES WAS BYPASSABLE. `addAttachment` accepted any
 * key that `startsWith` the task's prefix, and so would a cover check written
 * the same way. But `R2Service.getObjectUrl` in public-CDN mode returned
 * `${publicUrl}/${key}` with the key UNENCODED (it signs every object now,
 * `found-30-sep/public-cdn-url-makes-every-object-public`, and only a picture
 * on show is served so), and a browser collapses `..` in a URL path before it
 * asks for it:
 *
 *   workspaces/A/tasks/T/attachments/../../../../workspaces/B/tasks/X/attachments/secret.pdf
 *
 * passes `startsWith('workspaces/A/tasks/T/attachments/')` and fetches
 * workspace B's file. Requiring exactly one trailing segment in the
 * sanitisers' own alphabet leaves nothing to traverse with: no slash, no `%`
 * for an encoded one, and `.` / `..` refused outright.
 *
 * Pure, so the rule is unit-tested without a database or a bucket.
 */

import { isKeyDirectlyUnder, isSafeSegment } from '../../common/storage/object-key-shape'

/**
 * Exactly the key `createAttachmentUploadUrl` mints for this task in this
 * workspace. What `addAttachment` may register: an upload, and nothing else.
 */
export function isTaskUploadKey(key: unknown, workspaceId: string, taskId: string): boolean {
  return isKeyDirectlyUnder(key, `workspaces/${workspaceId}/tasks/${taskId}/attachments/`)
}

/**
 * A HYPERLINK attachment, not an object.
 *
 * "Attach by link" writes the URL into `storage_key` itself, so an attachment
 * row's key is one of three things: nothing yet (a file still arriving), an
 * object key in one of the two shapes above, or an http(s) link. No writer
 * produces an object key that starts with a scheme, so the scheme is the
 * discriminator.
 *
 * Every reader that would otherwise SIGN, FETCH or DELETE the key asks this
 * first. Before it existed each of them treated a link as an object:
 * `getObjectUrl('https://…')` gave `${CDN}/https://…` or a presigned GET for a
 * key that does not exist, both indexers tried to read the link out of the
 * bucket on every pass, and removing the attachment sent a DELETE for it.
 */
export function isLinkAttachmentKey(key: unknown): boolean {
  return typeof key === 'string' && /^https?:\/\//i.test(key)
}

/**
 * What an attachment IS, sent with every attachment the API returns — so a
 * client asks the row rather than repeating the rule above. The cover picker
 * needs it: a linked image becomes the cover's LINK, and an uploaded one its
 * stored key.
 */
export function attachmentKind(key: unknown): 'link' | 'file' {
  return isLinkAttachmentKey(key) ? 'link' : 'file'
}

/**
 * Any object this task legitimately owns: an upload in either importer's shape,
 * or an inbound-email attachment. What a COVER's stored key may point at, since
 * the cover picker's Attachments tab offers every image the task has — a file
 * as its key, and a link (see above) as the cover's link, never as a key.
 *
 * `workspaceId` is required when writing and optional when signing. At sign
 * time the task id alone binds the key: every writer builds the workspace
 * segment from the task's real workspace, so no object can exist at
 * `workspaces/<other>/tasks/<this task>/…`, and signing such a key would name
 * nothing.
 */
export function isTaskOwnObjectKey(key: unknown, taskId: string, workspaceId?: string): boolean {
  if (typeof key !== 'string') return false
  const inbound = `inbound-email/${taskId}/`
  if (key.startsWith(inbound)) return isKeyDirectlyUnder(key, inbound)
  const m = /^workspaces\/([^/]+)\/tasks\/([^/]+)\/attachments\/([^/]+)$/.exec(key)
  if (!m) return false
  const [, ws, task, name] = m
  if (task !== taskId) return false
  if (workspaceId !== undefined && ws !== workspaceId) return false
  return isSafeSegment(ws) && isSafeSegment(name)
}
