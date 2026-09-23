import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { R2Service } from '../../common/storage/r2.service'
import { DB_TOKEN } from '../../common/database/database.module'
import { EmailService } from '../email/email.service'
import { clipPrefix, isWorkspaceClipKey } from './clip-keys'

@Injectable()
export class ClipsService {
  constructor(
    private readonly r2: R2Service,
    private readonly email: EmailService,
    @Inject(DB_TOKEN) private readonly db: Db,
  ) {}

  private sanitizeFileName(input: string): string {
    return input.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'clip.webm'
  }

  async createUploadUrl(
    workspaceId: string,
    actorEmail: string,
    body: {
      fileName: string
      contentType: string
      durationSeconds?: number
      title?: string
    },
  ) {
    if (!this.r2.configured) throw new BadRequestException('R2 is not configured')
    const fileName = this.sanitizeFileName(body.fileName)
    const key = `${clipPrefix(workspaceId)}${Date.now()}-${fileName}`
    const uploadUrl = await this.r2.presignPutObject(
      key,
      body.contentType || 'video/webm',
      {
        title: (body.title ?? fileName).slice(0, 120),
        durationseconds: String(body.durationSeconds ?? 0),
        recordedby: actorEmail,
      },
    )
    return { uploadUrl, storageKey: key }
  }

  async list(workspaceId: string) {
    if (!this.r2.configured) return []
    const prefix = clipPrefix(workspaceId)
    const listed = await this.r2.listObjects(prefix, 200)
    const objects = (listed.Contents ?? []).filter((o) => !!o.Key)
    const results = await Promise.all(objects.map(async (obj) => {
      const key = obj.Key!
      const head = await this.r2.headObject(key)
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
      }
    }))
    return results.sort((a, b) => {
      const left = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const right = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return right - left
    })
  }

  async remove(workspaceId: string, storageKey: string) {
    // By shape, not prefix: a prefix check let `..` delete another
    // workspace's object (clip-keys.ts). A non-string is refused with the rest.
    if (!isWorkspaceClipKey(storageKey, workspaceId)) {
      throw new BadRequestException('Invalid clip key for workspace')
    }
    await this.r2.deleteObject(storageKey)
    return { ok: true }
  }

  async share(
    workspaceId: string,
    actorId: string,
    actorEmail: string,
    body: {
      storageKey: string
      mode: 'member' | 'external' | 'public'
      userId?: string
      email?: string
      expiresInMinutes?: number
    },
  ) {
    // By shape, not prefix — see clip-keys.ts for the key that signed another
    // workspace's file.
    if (!isWorkspaceClipKey(body.storageKey, workspaceId)) {
      throw new BadRequestException('Invalid clip key for workspace')
    }
    const expiresInSeconds = Math.max(60, Math.min(7 * 24 * 60 * 60, (body.expiresInMinutes ?? 60) * 60))
    const shareUrl = await this.r2.getObjectUrl(body.storageKey, expiresInSeconds)
    const clipName = body.storageKey.split('/').pop() ?? 'clip.webm'

    if (body.mode === 'public') return { shareUrl }

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
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    })

    return { shareUrl, sentTo: recipientEmail }
  }
}

