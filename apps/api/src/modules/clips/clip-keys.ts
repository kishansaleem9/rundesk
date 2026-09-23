/**
 * WHICH STORAGE KEYS ARE A WORKSPACE'S CLIPS — by shape, like every other key
 * a client hands back (see `common/storage/object-key-shape.ts`).
 *
 * A clip is a storage object and nothing else: there is no clips table, and
 * the key is the clip's only identity. `createUploadUrl` mints it as
 * `workspaces/<ws>/clips/<Date.now()>-<name>`, with the name sanitised, so a
 * key a client sends back is one of this workspace's clips exactly when it is
 * that prefix plus ONE safe segment.
 *
 * `share` and `remove` checked `startsWith(prefix)`, which `..` walks out of.
 * Measured on a lane: `workspaces/A/clips/../../../workspaces/B/tasks/…/secret.pdf`
 * passed both. Share signed it, and the URL, with its dot segments collapsed
 * the way a browser collapses them, served workspace B's file. Remove answered
 * 200 and B's object was gone from the store.
 *
 * Pure, so the rule is unit-tested without a bucket, and importable by the
 * tasks module (a clip attached to a task is copied from one of these keys)
 * without a module cycle.
 */

import { isKeyDirectlyUnder } from '../../common/storage/object-key-shape'

/** Where a workspace's clips live. Ends in `/`. */
export const clipPrefix = (workspaceId: string): string => `workspaces/${workspaceId}/clips/`

/** One of this workspace's clips: its prefix plus exactly one safe segment. */
export function isWorkspaceClipKey(key: unknown, workspaceId: string): boolean {
  return isKeyDirectlyUnder(key, clipPrefix(workspaceId))
}
