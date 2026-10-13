import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { chatChannelMembers, chatChannels, chatMessageReactions, chatMessages, clickupImportJobs, users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { ImportFilesService } from '../integrations/clickup-import/import-files'
import { IMPORT_ACCESS, type Importer } from '../integrations/clickup-import/import-access'
import { assertImportTarget } from '../integrations/clickup-import/import-target'
import { storable } from '../integrations/clickup-import/spreadsheet-import.util'
import { readSlackExport, slackEmoji, slackText, SlackExportError, type SlackChannel, type SlackExport } from './slack-export'

/**
 * SLACK'S EXPORT INTO CHAT, AS CLICKUP IMPORTS IT (`commit-log/log-601eacc-2`).
 *
 * The import page uploads the export (`import-files.ts`), shows its public
 * channels — how many messages each, how many of its people are members here —
 * and imports the ones chosen as a job the page follows, as the spreadsheet
 * import's is (`clickup_import_jobs`, source `slack`):
 *
 *   · each channel a new Chat channel, named as in Slack (with `-slack` after
 *     it when the workspace already has a channel of that name), its purpose
 *     its description and its topic its topic, archived if it was, in the
 *     Space chosen or the workspace's own Chat;
 *   · its newest 10 000 messages in order, each at the moment it was written,
 *     its replies in its thread, its reactions under whoever reacted;
 *   · a message's author is the member here with that person's email — and
 *     the channel gets them as a member; one nobody here is kept under the
 *     person importing, drawn under the name it was written under
 *     (`chat_messages.imported_author`), and their reactions are counted, not
 *     invented;
 *   · a mention of a member here is a mention of them (`<@id>`), of anyone
 *     else their name.
 *
 * A guest does not import, as no import is theirs (`IMPORT_ACCESS`); a run
 * that fails takes away the channels it made; the file is gone when the run
 * ends.
 */

export const SLACK_SOURCE = 'slack'

export type SlackImportSummary = {
  source: 'slack'
  channelsCreated: number
  messagesImported: number
  repliesImported: number
  reactionsImported: number
  /** People in the export who are members here, matched by email. */
  peopleMatched: number
  /** Names messages were written under by people who are nobody here: drawn under their name. */
  authorsNotMembers: string[]
  /** Reactions by people who are nobody here, which have nobody to stand under. */
  reactionsSkipped: number
  /** Older messages past the 10 000 a channel. */
  messagesPastTheLimit: number
  notImported: { privateChannels: number; directMessages: number }
  channels: Array<{ id: string; name: string; slackName: string; messages: number }>
  errors: string[]
}

const BATCH = 500

@Injectable()
export class SlackImportService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly files: ImportFilesService,
  ) {}

  /** What the export holds, before anything is written: its public channels, and its people found here. */
  async preview(workspaceId: string, importer: Importer, dto: { fileKey?: unknown }) {
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    const exp = await this.readExport(workspaceId, importer.id, dto.fileKey)
    const members = await this.membersByEmail(workspaceId)
    const people = [...exp.users.values()].filter((u) => !u.bot)
    return {
      channels: exp.channels.map((c) => ({
        name: c.name,
        archived: c.archived,
        messages: c.messages.length,
        replies: c.messages.filter((m) => m.threadTs).length,
        pastTheLimit: c.dropped,
      })),
      people: { total: people.length, members: people.filter((u) => u.email && members.has(u.email)).length },
      notImported: exp.notImported,
    }
  }

  async start(workspaceId: string, importer: Importer, dto: { fileKey?: unknown; channels?: unknown; spaceId?: unknown }) {
    await IMPORT_ACCESS.assertMayImport(this.db, { workspaceId, actorId: importer.id })
    if (dto.spaceId !== undefined && dto.spaceId !== null) {
      await assertImportTarget(this.db, { workspaceId, spaceId: dto.spaceId, actorId: importer.id })
    }
    const exp = await this.readExport(workspaceId, importer.id, dto.fileKey)
    const wanted = Array.isArray(dto.channels) ? new Set(dto.channels.filter((c): c is string => typeof c === 'string')) : null
    const chosen = exp.channels.filter((c) => !wanted || wanted.has(c.name))
    if (!chosen.length) throw new BadRequestException('Choose at least one channel of the export to import')
    const total = chosen.reduce((n, c) => n + c.messages.length, 0)
    const [job] = await this.db
      .insert(clickupImportJobs)
      .values({ workspaceId, createdById: importer.id, status: 'pending', total, source: SLACK_SOURCE })
      .returning({ id: clickupImportJobs.id })
    const spaceId = typeof dto.spaceId === 'string' ? dto.spaceId : null
    void this.run(job.id, workspaceId, importer, exp, chosen, spaceId)
      .catch(() => undefined)
      .finally(() => this.files.discard(workspaceId, importer.id, dto.fileKey))
    return { jobId: job.id }
  }

  private async readExport(workspaceId: string, userId: string, fileKey: unknown): Promise<SlackExport> {
    const bytes = await this.files.read(workspaceId, userId, fileKey, 'slack')
    try {
      return readSlackExport(bytes)
    } catch (e) {
      if (e instanceof SlackExportError) throw new BadRequestException(e.message)
      throw e
    }
  }

  /** Members here by their email, lower-cased; a guest is matched to nothing, as they are given what is shared with them. */
  private async membersByEmail(workspaceId: string): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ userId: users.id, email: users.email, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
    const out = new Map<string, string>()
    for (const r of rows) if (r.email && r.role !== 'guest') out.set(r.email.trim().toLowerCase(), r.userId)
    return out
  }

  /** Awaitable, so a test can run it and read the summary. */
  async run(
    jobId: string,
    workspaceId: string,
    importer: Importer,
    exp: SlackExport,
    chosen: SlackChannel[],
    spaceId: string | null,
  ): Promise<SlackImportSummary> {
    const summary: SlackImportSummary = {
      source: 'slack',
      channelsCreated: 0,
      messagesImported: 0,
      repliesImported: 0,
      reactionsImported: 0,
      peopleMatched: 0,
      authorsNotMembers: [],
      reactionsSkipped: 0,
      messagesPastTheLimit: chosen.reduce((n, c) => n + c.dropped, 0),
      notImported: exp.notImported,
      channels: [],
      errors: [],
    }
    const made: string[] = []
    try {
      await this.db.update(clickupImportJobs).set({ status: 'processing', updatedAt: new Date() }).where(eq(clickupImportJobs.id, jobId))
      const byEmail = await this.membersByEmail(workspaceId)
      const memberOf = (slackId: string): string | null => {
        const email = exp.users.get(slackId)?.email
        return email ? byEmail.get(email) ?? null : null
      }
      const matched = new Set<string>()
      for (const u of exp.users.values()) if (!u.bot && u.email && byEmail.has(u.email)) matched.add(u.id)
      summary.peopleMatched = matched.size
      const strangers = new Set<string>()
      const channelNames = new Map(exp.channels.map((c) => [c.id, c.name]))
      const taken = new Set(
        (await this.db.select({ name: chatChannels.name }).from(chatChannels).where(eq(chatChannels.workspaceId, workspaceId))).map((r) => r.name.toLowerCase()),
      )
      let processed = 0

      for (const c of chosen) {
        const name = freeName(c.name, taken)
        taken.add(name)
        const [channel] = await this.db
          .insert(chatChannels)
          .values({
            workspaceId,
            spaceId,
            name,
            description: c.purpose || null,
            topic: c.topic || null,
            isPrivate: false,
            createdById: importer.id,
            archivedAt: c.archived ? new Date() : null,
          })
          .returning({ id: chatChannels.id })
        made.push(channel.id)
        summary.channelsCreated++

        const memberIds = new Set<string>([importer.id])
        for (const s of c.members) {
          const id = memberOf(s)
          if (id) memberIds.add(id)
        }
        for (const m of c.messages) {
          const id = m.user ? memberOf(m.user) : null
          if (id) memberIds.add(id)
        }
        await this.db
          .insert(chatChannelMembers)
          .values([...memberIds].map((userId) => ({ channelId: channel.id, userId })))
          .onConflictDoNothing()

        // Each message an id of its own before it is written, so a reply names its thread's start.
        const idByTs = new Map(c.messages.map((m) => [m.ts, randomUUID()]))
        const rows = c.messages.map((m) => {
          const author = m.user ? memberOf(m.user) : null
          if (!author) strangers.add(m.name)
          const { body, mentions } = slackText(m.text, {
            userName: (id) => exp.users.get(id)?.name ?? id,
            memberOf,
            channelName: (id) => channelNames.get(id) ?? null,
          })
          const parent = m.threadTs ? idByTs.get(m.threadTs) ?? null : null
          return {
            id: idByTs.get(m.ts)!,
            channelId: channel.id,
            authorId: author ?? importer.id,
            importedAuthor: author ? null : m.name.slice(0, 200),
            parentMessageId: parent,
            body: storable(body),
            mentions: mentions.length ? mentions.map((userId) => ({ userId })) : null,
            createdAt: m.at,
          }
        })
        // Thread starts first, then their replies, which name them.
        for (const group of [rows.filter((r) => !r.parentMessageId), rows.filter((r) => r.parentMessageId)]) {
          for (let k = 0; k < group.length; k += BATCH) {
            const slice = group.slice(k, k + BATCH)
            await this.db.insert(chatMessages).values(slice)
            processed += slice.length
            await this.progress(jobId, processed)
          }
        }
        const replies = rows.filter((r) => r.parentMessageId).length
        summary.messagesImported += rows.length
        summary.repliesImported += replies

        const reactions: Array<{ messageId: string; userId: string; emoji: string }> = []
        const seen = new Set<string>()
        for (const m of c.messages) {
          for (const r of m.reactions) {
            for (const who of r.users) {
              const userId = memberOf(who)
              if (!userId) {
                summary.reactionsSkipped++
                continue
              }
              const emoji = slackEmoji(r.name)
              const key = `${m.ts}|${userId}|${emoji}`
              if (seen.has(key)) continue
              seen.add(key)
              reactions.push({ messageId: idByTs.get(m.ts)!, userId, emoji })
            }
          }
        }
        for (let k = 0; k < reactions.length; k += BATCH) await this.db.insert(chatMessageReactions).values(reactions.slice(k, k + BATCH))
        summary.reactionsImported += reactions.length
        summary.channels.push({ id: channel.id, name, slackName: c.name, messages: rows.length })
      }

      summary.authorsNotMembers = [...strangers].sort().slice(0, 100)
      await this.db
        .update(clickupImportJobs)
        .set({
          status: 'completed',
          processed,
          createdCount: summary.messagesImported,
          result: storable(summary) as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(clickupImportJobs.id, jobId))
      return summary
    } catch (e: any) {
      // What the run made is taken away: its channels, and with them their messages, members and reactions.
      if (made.length) await this.db.delete(chatChannels).where(inArray(chatChannels.id, made)).catch(() => undefined)
      await this.db
        .update(clickupImportJobs)
        .set({ status: 'failed', error: storable(e?.message ?? 'Import failed'), createdCount: 0, updatedAt: new Date() })
        .where(eq(clickupImportJobs.id, jobId))
        .catch(() => undefined)
      throw e
    }
  }

  private async progress(jobId: string, processed: number) {
    await this.db
      .update(clickupImportJobs)
      .set({ processed, createdCount: processed, updatedAt: new Date() })
      .where(and(eq(clickupImportJobs.id, jobId), sql`${clickupImportJobs.status} = 'processing'`))
      .catch(() => undefined)
  }
}

/** A channel name nobody in the workspace has yet: Slack's own, else with `-slack` after it, then a number. */
export function freeName(slackName: string, taken: Set<string>): string {
  const base = slackName.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-').slice(0, 70) || 'slack'
  if (!taken.has(base)) return base
  const first = `${base}-slack`
  if (!taken.has(first)) return first
  for (let n = 2; ; n++) if (!taken.has(`${first}-${n}`)) return `${first}-${n}`
}
