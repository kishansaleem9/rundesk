/**
 * WHOSE A CLIP IS, AND WHO MAY READ AND DELETE IT
 * (`found-5-oct/guests-read-and-delete-every-clip`).
 *
 * The library's routes asked membership and nothing else. Measured on a lane:
 * a guest was listed every clip of the workspace, each with a signed URL that
 * served its bytes, deleted the admin's, and found every clip's name and key in
 * search; a member deleted another member's clip.
 *
 * ClickUp, from its help centre (read through search excerpts; help.clickup.com
 * is blocked here). "Clips feature availability and limits": guests, like
 * members, can record Clips and Voice Clips, "use Clips Hub" and "view Clips
 * shared with them"; and "Clips Hub only displays Clips, Voice Clips, and
 * SyncUps recorded by you". "Clips Hub": a clip's menu there offers Rename,
 * Download and Delete. So:
 *
 *   - a guest's library is the clips they recorded, as ClickUp's hub is. A
 *     clip somebody shares with a guest (the clips page's Share › Member mails
 *     them its link) is watched through that link, `/clips/<token>`, and is not
 *     added to their library;
 *   - what a guest may not read is not theirs to link, share or copy into a
 *     task either: those routes hand out the clip, so they ask the same rule,
 *     and refuse saying which clips are theirs;
 *   - a clip is deleted by whoever recorded it, or by somebody who manages the
 *     workspace (`isManagerRole`), as the item's rule says.
 *
 * A clip has no row. Who recorded it travels with its object as metadata:
 * `recordedby`, their address, since the library began, and `recordedbyid`,
 * their id, since this rule, because an address can be changed (SCIM rewrites
 * one) and an id cannot. A clip from before the id is known by its address.
 *
 * Pure, so the rule is tested without a store, and importable by search, which
 * reads the library too, without a module cycle. Who is asking is read from
 * the database in one place, `clip-reader.ts`, for every route that asks.
 */
import { isManagerRole } from '../../common/permissions/workspace-roles'

/** Who is asking: their id, their address as the users table holds it, and their role in the clip's workspace. */
export type ClipReader = { id: string; email?: string | null; role?: string | null }

/** A stored clip's metadata as the store answers a HEAD: keys lower-case, as S3 gives them. */
export type ClipMetadata = Record<string, string | undefined> | undefined

/** What a delete answers somebody who may not: who may. */
export const CLIP_DELETE_REFUSAL =
  'Only the person who recorded this clip, or a manager or admin of the workspace, can delete it'

/** What a link, a share or a task's copy of a clip answers a guest who did not record it: which clips are theirs. */
export const CLIP_READ_REFUSAL = 'Guests can share or attach only the clips they recorded'

/** Whether `reader` recorded the clip: by the id it carries, or, for a clip from before the id, by its address. */
export function recordedByReader(meta: ClipMetadata, reader: ClipReader): boolean {
  const id = meta?.recordedbyid
  if (id) return id === reader.id
  const address = meta?.recordedby?.trim().toLowerCase()
  const own = reader.email?.trim().toLowerCase()
  return !!address && !!own && address === own
}

/** A guest reads only the clips they recorded; anybody else in the workspace reads every clip. */
export function readsOnlyOwnClips(role: string | null | undefined): boolean {
  return role === 'guest'
}

/** Whether `reader` may see the clip in the library, in search, and by its signed URL. */
export function mayReadClip(meta: ClipMetadata, reader: ClipReader): boolean {
  return !readsOnlyOwnClips(reader.role) || recordedByReader(meta, reader)
}

/**
 * What a link or a share of a clip answers a guest where the link would open
 * for anybody who holds it (`found-30-sep/guests-may-ask-for-clip-links`).
 */
export const CLIP_GUEST_PUBLIC_REFUSAL = 'Guests cannot share clips publicly'

/**
 * WHETHER `reader` MAY MAKE THE CLIP'S LINK, given who the workspace's clip
 * links open for (`found-30-sep/guests-may-ask-for-clip-links`).
 *
 * A clip's link plays it to whoever holds it, unless the workspace blocks
 * public sharing (then to its members, signed in). ClickUp lets a guest record
 * clips and keeps a guest from sharing anything publicly; Rundesk refuses a
 * guest a doc's public link for that reason ("Guests cannot share docs"). A
 * guest asked for their clip's link, and for its share by mail or in public,
 * and was given a link anybody could open (201). So a guest makes no link that
 * opens for anybody; where the links open for members only, theirs is made.
 */
export function mayShareClip(reader: ClipReader, audience: 'anyone' | 'members'): boolean {
  return !(reader.role === 'guest' && audience === 'anyone')
}

/** Whether `reader` may delete the clip: its recorder, or somebody who manages the workspace. */
export function mayDeleteClip(meta: ClipMetadata, reader: ClipReader): boolean {
  return isManagerRole(reader.role) || recordedByReader(meta, reader)
}
