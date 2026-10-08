import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { clipLinks, users, workspaceMembers, workspaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { R2Service } from '../../common/storage/r2.service'
import { safeFileName } from '../../common/storage/file-name'
import { DB_TOKEN } from '../../common/database/database.module'
import { EmailService } from '../email/email.service'
import { isManagerRole } from '../../common/permissions/workspace-roles'
import { clipPrefix, isWorkspaceClipKey } from './clip-keys'
import { CLIP_DELETE_REFUSAL, CLIP_GUEST_PUBLIC_REFUSAL, CLIP_READ_REFUSAL, mayDeleteClip, mayReadClip, mayShareClip, type ClipReader } from './clip-access'
import { clipReaderOf } from './clip-reader'

/** How many clips the library lists: the newest, whatever the workspace holds. */
const CLIPS_LISTED = 200

/**
 * WHO A CLIP'S LINK OPENS FOR (`resume-defects/resume-7`).
 *
 * `anyone` is ClickUp's rule: "anyone with the link to a Clip can access it",
 * and Clip URLs "are shared publicly and do not require authentication". The
 * one exception is Rundesk's own: a workspace that blocks public sharing
 * (§A4.2, "Stop anyone minting anonymous public links") has promised there are
 * no anonymous links into it, so there the same link opens for its members,
 * signed in, and for nobody else. ClickUp's sources are silent on that switch
 * and clips; that is the safe rule, and every place that hands the link out
 * says which one applies.
 */
export type ClipLinkAudience = 'anyone' | 'members'

/** The app route a clip's link is. Relative: the web adds its own origin, an email the app's. */
export const clipLinkPath = (token: string): string => `/clips/${token}`

/** A token as `link` makes one: 24 random bytes, base64url. Anything else is nobody's clip. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32}$/

/**
 * How long the playback URL a view is handed stays signed, unless
 * `CLIP_PLAYBACK_URL_SECONDS` says otherwise. An hour covers a clip of
 * ClickUp's longest (45 minutes) in one sitting; the page signs again when a
 * signature lapses under it, and the link itself never does.
 */
const PLAYBACK_URL_SECONDS = 60 * 60

@Injectable()
export class ClipsService {
  private readonly playbackSeconds: number
  private readonly appUrl: string

  constructor(
    private readonly r2: R2Service,
    private readonly email: EmailService,
    @Inject(DB_TOKEN) private readonly db: Db,
    config: ConfigService,
  ) {
    /*
     * CONFIGURABLE SO A CHECK CAN WAIT ONE OUT. "The copied link still plays
     * after the signing window" is only measured by getting past a window: the
     * lanes and CI sign for seconds, and the suite waits.
     */
    const seconds = Number(config.get<string>('CLIP_PLAYBACK_URL_SECONDS'))
    this.playbackSeconds = Number.isFinite(seconds) && seconds >= 1 ? Math.floor(seconds) : PLAYBACK_URL_SECONDS
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')
  }

  /**
   * Who is asking, as the clip rule reads them (`clip-reader.ts`): read for
   * every library route the one way search and a task's copy read it.
   */
  readerOf(workspaceId: string, userId: string): Promise<ClipReader> {
    return clipReaderOf(this.db, workspaceId, userId)
  }

  async createUploadUrl(
    workspaceId: string,
    actor: { id: string; email: string },
    body: {
      fileName: string
      contentType: string
      durationSeconds?: number
      title?: string
    },
  ) {
    if (!this.r2.configured) throw new BadRequestException('R2 is not configured')
    const fileName = safeFileName(body.fileName, 'clip.webm')
    const key = `${clipPrefix(workspaceId)}${Date.now()}-${fileName}`
    const uploadUrl = await this.r2.presignPutObject(
      key,
      body.contentType || 'video/webm',
      {
        title: (body.title ?? fileName).slice(0, 120),
        durationseconds: String(body.durationSeconds ?? 0),
        recordedby: actor.email,
        // Who recorded it, by who they are: the clip is theirs to see and to
        // delete, and an address can change (`clip-access.ts`).
        recordedbyid: actor.id,
      },
    )
    return { uploadUrl, storageKey: key }
  }

  async list(workspaceId: string, reader: ClipReader) {
    if (!this.r2.configured) return []
    const prefix = clipPrefix(workspaceId)
    /*
     * THE NEWEST 200. A listing answers in key order, and a clip's key starts
     * with the moment it was made, so its first page of 200 was the
     * workspace's 200 OLDEST clips: from the 201st on, a new clip never
     * appeared here (`found-23-sep/clip-library-lists-the-oldest-200`). Every
     * page of the listing is read, and sorted newest first; how many of them
     * are then looked up is the reader's (below).
     */
    const objects = (await this.r2.listAllObjects(prefix))
      .filter((o) => !!o.Key)
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0) || (a.Key! < b.Key! ? 1 : a.Key! > b.Key! ? -1 : 0))
    // Whether this reader may make a clip's link here, asked once (`mayShareClip`).
    const mayShare = mayShareClip(reader, await this.audienceOf(workspaceId))
    /*
     * A GUEST'S LIBRARY IS THE CLIPS THEY RECORDED
     * (`found-5-oct/guests-read-and-delete-every-clip`, `clip-access.ts`). It
     * was every clip of the workspace, each signed. Whose a clip is lives in its
     * metadata, so each is looked up before anything is signed, and one the
     * reader may not see is neither listed nor signed. A guest's newest 200 are
     * looked for a page at a time, newest first, until 200 are found or none is
     * left; anybody else's library is the newest 200, one page, as before.
     */
    const read = async (obj: (typeof objects)[number]) => {
      const key = obj.Key!
      const head = await this.r2.headObject(key)
      if (!mayReadClip(head.Metadata, reader)) return null
      const fileName = key.split('/').pop() ?? 'clip.webm'
      const title = head.Metadata?.title ?? fileName
      const durationSeconds = Number(head.Metadata?.durationseconds ?? 0)
      const recordedBy = head.Metadata?.recordedby ?? 'teammate'
      const url = await this.r2.getObjectUrl(key)
      return {
        id: key,
        storageKey: key,
        title,
        fileName,
        durationSeconds,
        recordedBy,
        sizeBytes: obj.Size ?? 0,
        createdAt: obj.LastModified?.toISOString() ?? null,
        url,
        // So the page offers Delete only where the server would do it.
        mayDelete: mayDeleteClip(head.Metadata, reader),
        // And Share, which hands out the clip's link (`found-30-sep/guests-may-ask-for-clip-links`).
        mayShare,
      }
    }
    const results: Array<NonNullable<Awaited<ReturnType<typeof read>>>> = []
    for (let from = 0; from < objects.length && results.length < CLIPS_LISTED; from += CLIPS_LISTED) {
      for (const clip of await Promise.all(objects.slice(from, from + CLIPS_LISTED).map(read))) {
        if (clip && results.length < CLIPS_LISTED) results.push(clip)
      }
    }
    return results.sort((a, b) => {
      const left = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const right = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return right - left
    })
  }

  async remove(workspaceId: string, storageKey: string, reader: ClipReader) {
    // By shape, not prefix: a prefix check let `..` delete another
    // workspace's object (clip-keys.ts). A non-string is refused with the rest.
    if (!isWorkspaceClipKey(storageKey, workspaceId)) {
      throw new BadRequestException('Invalid clip key for workspace')
    }
    /*
     * WHO MAY DELETE IT: whoever recorded it, or somebody who manages the
     * workspace (`found-5-oct/guests-read-and-delete-every-clip`,
     * `clip-access.ts`). Nobody was asked: a guest deleted the admin's clip and
     * a member another member's. Somebody who manages the workspace needs no
     * look at the clip; for anybody else it is looked up, so a clip that is not
     * there is not found, and one that is not theirs is refused, saying who may.
     */
    const head = isManagerRole(reader.role) ? undefined : await this.headOrMissing(storageKey)
    if (!mayDeleteClip(head?.Metadata, reader)) throw new ForbiddenException(CLIP_DELETE_REFUSAL)
    await this.r2.deleteObject(storageKey)
    // The clip's link goes with it: ClickUp keeps a clip "forever, unless
    // manually deleted", and a deleted clip has nothing left to link to.
    await this.db
      .delete(clipLinks)
      .where(and(eq(clipLinks.workspaceId, workspaceId), eq(clipLinks.storageKey, storageKey)))
    return { ok: true }
  }

  /**
   * THE CLIP'S LINK: `/clips/<token>`, the same one every time it is asked for
   * (`resume-defects/resume-7`).
   *
   * Copy link and New tab were handed the signed storage URL, asked for a day,
   * and the toast said only "Link copied". A link that dies over a weekend,
   * pasted into a chat or a doc, is the rot `clip-create-task-persists-24h-url`
   * took out of task descriptions. The token is the clip's; the signature is
   * made fresh by `watch` each time the link is opened.
   *
   * The key's shape first, as for every key a client hands back, and then the
   * clip itself: a link to nothing would be a Copy link that reports success
   * and plays nothing.
   *
   * AND WHETHER ITS ASKER MAY READ IT (`found-5-oct/guests-read-and-delete-every-clip`,
   * `clip-access.ts`). A link plays the clip to whoever holds it, so a guest
   * who was handed somebody else's key got a link to a clip their library
   * does not show them (201), and it played signed out (200). They are
   * refused, told which clips are theirs; a key naming no clip is still not
   * found. And a guest makes no public link at all, even of their own
   * (`found-30-sep/guests-may-ask-for-clip-links`, `mayShareClip`).
   */
  async link(workspaceId: string, reader: ClipReader, clipKey: unknown) {
    if (!isWorkspaceClipKey(clipKey, workspaceId)) {
      throw new BadRequestException('Invalid clip key for workspace')
    }
    const key = clipKey as string
    if (!this.r2.configured) throw new BadRequestException('R2 is not configured')
    const head = await this.headOrMissing(key)
    if (!mayReadClip(head.Metadata, reader)) throw new ForbiddenException(CLIP_READ_REFUSAL)
    const audience = await this.audienceOf(workspaceId)
    // A guest makes no link that opens for anybody (`mayShareClip`).
    if (!mayShareClip(reader, audience)) throw new ForbiddenException(CLIP_GUEST_PUBLIC_REFUSAL)
    const [existing] = await this.db
      .select({ token: clipLinks.token })
      .from(clipLinks)
      .where(eq(clipLinks.storageKey, key))
      .limit(1)
    if (existing) return this.linkView(existing.token, audience)
    // Unguessable; a clash on the token, or somebody linking the same clip at
    // this moment, inserts nothing, and the row that is there is the answer.
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = randomBytes(24).toString('base64url')
      const [row] = await this.db
        .insert(clipLinks)
        .values({ workspaceId, storageKey: key, token, createdById: reader.id })
        .onConflictDoNothing()
        .returning({ token: clipLinks.token })
      if (row) return this.linkView(row.token, audience)
      const [raced] = await this.db
        .select({ token: clipLinks.token })
        .from(clipLinks)
        .where(eq(clipLinks.storageKey, key))
        .limit(1)
      if (raced) return this.linkView(raced.token, audience)
    }
    throw new BadRequestException('Could not allocate a clip link, please retry')
  }

  /**
   * WHAT OPENING A CLIP'S LINK PLAYS: the clip's title and length, and a URL
   * signed now, for `playbackSeconds` (`resume-defects/resume-7`).
   *
   * Signed on every view, so the link outlives every signature it is ever
   * turned into. Anyone holding it may watch (ClickUp); in a workspace that
   * blocks public sharing, only its members, signed in: 401 to nobody, which
   * the page answers with a sign-in, and 404 to somebody from elsewhere, as
   * the workspace guard answers a non-member.
   *
   * A token that is not one, a clip whose link was never made or was deleted,
   * and a clip whose object is gone are the same 404, and nothing is signed.
   */
  async watch(token: unknown, viewer: { id?: string; role?: string } | null) {
    if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) throw new NotFoundException('Clip not found')
    const [row] = await this.db
      .select({
        workspaceId: clipLinks.workspaceId,
        storageKey: clipLinks.storageKey,
        blockPublicSharing: workspaces.blockPublicSharing,
        workspaceArchived: workspaces.isArchived,
      })
      .from(clipLinks)
      .innerJoin(workspaces, eq(workspaces.id, clipLinks.workspaceId))
      .where(eq(clipLinks.token, token))
      .limit(1)
    // An archived workspace leaves its own members' list of workspaces. Its
    // clips' links close with it, and open again if it is restored.
    if (!row || row.workspaceArchived) throw new NotFoundException('Clip not found')
    if (row.blockPublicSharing) {
      if (!viewer?.id) {
        throw new UnauthorizedException('Sign in to watch this clip. It is shared with the members of its workspace only.')
      }
      if (!(await this.isMember(row.workspaceId, viewer))) throw new NotFoundException('Clip not found')
    }
    if (!this.r2.configured) throw new NotFoundException('Clip not found')
    const head = await this.headOrMissing(row.storageKey)
    const fileName = row.storageKey.split('/').pop() ?? 'clip.webm'
    return {
      title: head.Metadata?.title ?? fileName,
      durationSeconds: Number(head.Metadata?.durationseconds ?? 0),
      contentType: head.ContentType ?? 'video/webm',
      createdAt: head.LastModified?.toISOString() ?? null,
      url: await this.r2.getObjectUrl(row.storageKey, this.playbackSeconds),
      expiresInSeconds: this.playbackSeconds,
      audience: (row.blockPublicSharing ? 'members' : 'anyone') as ClipLinkAudience,
    }
  }

  async share(
    workspaceId: string,
    reader: ClipReader,
    actorEmail: string,
    body: {
      storageKey: string
      mode: 'member' | 'external' | 'public'
      userId?: string
      email?: string
    },
  ): Promise<{ token: string; path: string; audience: ClipLinkAudience; shareUrl: string; sentTo?: string }> {
    /*
     * EVERY MODE HANDS OUT THE CLIP'S LINK, never a signed URL
     * (`resume-defects/resume-7`). This signed the object for
     * `expiresInMinutes` (an hour from the clips page), showed the URL with no
     * word of when it would die, and only the email said so. The link does not
     * expire, so nothing is asked for and nothing is signed here: `link`
     * checks the key's shape, the clip, and whether its asker may read it, for
     * all three modes.
     */
    const made = await this.link(workspaceId, reader, body.storageKey)
    const shareUrl = `${this.appUrl}${made.path}`
    const clipName = body.storageKey.split('/').pop() ?? 'clip.webm'

    if (body.mode === 'public') return { ...made, shareUrl }

    // Somebody outside the workspace can never open a members-only link, so
    // mailing them one would be a share that reports success and works for
    // nobody. §A4.2's own sentence, as docs and portals refuse it.
    if (body.mode === 'external' && made.audience === 'members') {
      throw new ForbiddenException('Public sharing is disabled for this workspace')
    }

    let recipientEmail = body.email?.trim()
    if (body.mode === 'member') {
      if (!body.userId) throw new BadRequestException('userId is required')
      const [member] = await this.db
        .select({ email: users.email })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, body.userId)))
        .limit(1)
      if (!member) throw new NotFoundException('Member not found in workspace')
      recipientEmail = member.email
    }

    if (!recipientEmail) throw new BadRequestException('email is required')

    await this.email.sendClipSharedEmail({
      to: recipientEmail,
      actorEmail,
      clipName,
      clipUrl: shareUrl,
      audience: made.audience,
    })

    return { ...made, shareUrl, sentTo: recipientEmail }
  }

  private linkView(token: string, audience: ClipLinkAudience) {
    return { token, path: clipLinkPath(token), audience }
  }

  /** The stored clip's head, or 404: there is no clip behind the key. */
  private async headOrMissing(key: string) {
    try {
      return await this.r2.headObject(key)
    } catch {
      throw new NotFoundException('Clip not found')
    }
  }

  private async audienceOf(workspaceId: string): Promise<ClipLinkAudience> {
    const [ws] = await this.db
      .select({ blockPublicSharing: workspaces.blockPublicSharing })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
    return ws?.blockPublicSharing ? 'members' : 'anyone'
  }

  /** A member of the workspace, as `WorkspaceMemberGuard` reads one: a platform admin is let in. */
  private async isMember(workspaceId: string, viewer: { id?: string; role?: string }) {
    if (viewer.role === 'super_admin') return true
    const [member] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, viewer.id!)))
      .limit(1)
    return !!member
  }
}
