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
 * the same way. But `R2Service.getObjectUrl` in public-CDN mode returns
 * `${publicUrl}/${key}` with the key UNENCODED, and a browser collapses `..`
 * in a URL path before it asks for it:
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

const SEGMENT = /^[A-Za-z0-9._-]+$/

const isSafeSegment = (segment: string) => SEGMENT.test(segment) && segment !== '.' && segment !== '..'

/**
 * Exactly the key `createAttachmentUploadUrl` mints for this task in this
 * workspace. What `addAttachment` may register: an upload, and nothing else.
 */
export function isTaskUploadKey(key: unknown, workspaceId: string, taskId: string): boolean {
  if (typeof key !== 'string') return false
  const prefix = `workspaces/${workspaceId}/tasks/${taskId}/attachments/`
  return key.startsWith(prefix) && isSafeSegment(key.slice(prefix.length))
}

/**
 * Any object this task legitimately owns: an upload in either importer's shape,
 * or an inbound-email attachment. What a COVER may point at, since the cover
 * picker's Attachments tab offers every attachment the task has.
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
  if (key.startsWith(inbound)) return isSafeSegment(key.slice(inbound.length))
  const m = /^workspaces\/([^/]+)\/tasks\/([^/]+)\/attachments\/([^/]+)$/.exec(key)
  if (!m) return false
  const [, ws, task, name] = m
  if (task !== taskId) return false
  if (workspaceId !== undefined && ws !== workspaceId) return false
  return isSafeSegment(ws) && isSafeSegment(name)
}
