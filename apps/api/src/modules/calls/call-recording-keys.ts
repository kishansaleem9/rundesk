import { isKeyDirectlyUnder, isSafeSegment } from '../../common/storage/object-key-shape'

/**
 * WHICH KEYS ARE CALL RECORDINGS — by shape, as object-key-shape.ts explains.
 *
 * The recording presign mints `calls/<workspace>/<call>/recording-<ts>.webm`.
 * `attachRecording` checked `startsWith('calls/<ws>/<call>/')`, which a `..`
 * segment walks out of on a public-CDN deployment; and a meeting's
 * `recordingUrl` was signed whatever it named, so a member could store
 * another tenant's key there and be handed a working URL to it.
 */

/** Exactly the key the recording presign mints for THIS call. */
export function isCallRecordingKeyFor(key: unknown, workspaceId: string, callId: string): boolean {
  return isKeyDirectlyUnder(key, `calls/${workspaceId}/${callId}/`)
}

/** A recording of any call in THIS workspace — what a meeting's pointer may hold. */
export function isWorkspaceCallRecordingKey(key: unknown, workspaceId: string): boolean {
  if (typeof key !== 'string') return false
  const m = /^calls\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(key)
  return !!m && m[1] === workspaceId && isSafeSegment(m[2]) && isSafeSegment(m[3])
}
