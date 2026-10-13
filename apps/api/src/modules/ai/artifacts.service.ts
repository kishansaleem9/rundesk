import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { aiArtifacts, aiArtifactVersions, workspaceMembers, type DeckSlide } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What a deck may hold, so a model's answer is checked as a typed one would be. */
export const DECK_LIMITS = { title: 120, slides: 15, bullets: 8, bullet: 300, notes: 1000 } as const

export type DeckInput = { title: string; slides: DeckSlide[] }

/**
 * A DECK AS THE MODEL GAVE IT, read the way a form is read: a title, one to
 * fifteen slides, each with a title and at most eight short points. Anything
 * else is refused with what was wrong, so the model can be told and try again
 * rather than a broken deck being kept.
 */
export function parseDeck(input: unknown): { ok: true; deck: DeckInput } | { ok: false; reason: string } {
  const o = (input ?? {}) as Record<string, unknown>
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  if (!title) return { ok: false, reason: 'A slide deck needs a title' }
  if (title.length > DECK_LIMITS.title) return { ok: false, reason: `A deck's title is at most ${DECK_LIMITS.title} characters` }
  if (!Array.isArray(o.slides) || o.slides.length === 0) return { ok: false, reason: 'A slide deck needs at least one slide' }
  if (o.slides.length > DECK_LIMITS.slides) return { ok: false, reason: `A slide deck has at most ${DECK_LIMITS.slides} slides` }
  const slides: DeckSlide[] = []
  for (const [i, raw] of o.slides.entries()) {
    const s = (raw ?? {}) as Record<string, unknown>
    const st = typeof s.title === 'string' ? s.title.trim() : ''
    if (!st) return { ok: false, reason: `Slide ${i + 1} needs a title` }
    if (st.length > DECK_LIMITS.title) return { ok: false, reason: `Slide ${i + 1}'s title is at most ${DECK_LIMITS.title} characters` }
    const bullets = Array.isArray(s.bullets) ? s.bullets : []
    if (bullets.length > DECK_LIMITS.bullets) return { ok: false, reason: `Slide ${i + 1} has more than ${DECK_LIMITS.bullets} points` }
    const points: string[] = []
    for (const b of bullets) {
      const text = typeof b === 'string' ? b.trim() : ''
      if (!text) continue
      if (text.length > DECK_LIMITS.bullet) return { ok: false, reason: `A point on slide ${i + 1} is longer than ${DECK_LIMITS.bullet} characters` }
      points.push(text)
    }
    const notes = typeof s.notes === 'string' ? s.notes.trim().slice(0, DECK_LIMITS.notes) : ''
    slides.push({ title: st, bullets: points, ...(notes ? { notes } : {}) })
  }
  return { ok: true, deck: { title, slides } }
}

/**
 * WHAT BRAIN MAKES, kept as ClickUp keeps its Artifacts (`ledger-rows/row-853`):
 * the asker's own until they publish it to a link, changed by asking again for
 * the whole deck, and every version kept to go back to. Somebody else asking for
 * one by its id is told it is not there — the same answer as for one that is not.
 */
@Injectable()
export class ArtifactsService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async createDeck(workspaceId: string, userId: string, deck: DeckInput, prompt: string) {
    const [made] = await this.db
      .insert(aiArtifacts)
      .values({ workspaceId, createdById: userId, kind: 'deck', title: deck.title, currentVersion: 1 })
      .returning()
    await this.db.insert(aiArtifactVersions).values({ artifactId: made.id, version: 1, title: deck.title, slides: deck.slides, prompt: prompt.slice(0, 4000), createdById: userId })
    return { id: made.id, kind: 'deck' as const, title: made.title, slideCount: deck.slides.length, version: 1 }
  }

  async listMine(workspaceId: string, userId: string) {
    const rows = await this.db
      .select()
      .from(aiArtifacts)
      .where(and(eq(aiArtifacts.workspaceId, workspaceId), eq(aiArtifacts.createdById, userId)))
      .orderBy(desc(aiArtifacts.updatedAt))
      .limit(100)
    const out = []
    for (const a of rows) {
      const [v] = await this.db
        .select({ slides: aiArtifactVersions.slides })
        .from(aiArtifactVersions)
        .where(and(eq(aiArtifactVersions.artifactId, a.id), eq(aiArtifactVersions.version, a.currentVersion)))
        .limit(1)
      out.push({ id: a.id, kind: a.kind, title: a.title, slideCount: v?.slides.length ?? 0, version: a.currentVersion, published: !!a.publishToken, updatedAt: a.updatedAt })
    }
    return out
  }

  /**
   * The asker's own, or nothing: somebody else's id reads as one that does not
   * exist. And only while they are still a member of its workspace, other than
   * as a guest — the AI's own rule (`NamedWorkspaceMemberGuard`) — so a deck
   * does not outlast its maker's place in the workspace it was made from.
   */
  private async ownRow(id: string, userId: string) {
    if (!UUID.test(id)) throw new NotFoundException('That artifact is not here')
    const [found] = await this.db
      .select({ row: aiArtifacts, role: workspaceMembers.role })
      .from(aiArtifacts)
      .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, aiArtifacts.workspaceId), eq(workspaceMembers.userId, aiArtifacts.createdById)))
      .where(and(eq(aiArtifacts.id, id), eq(aiArtifacts.createdById, userId)))
      .limit(1)
    if (!found || found.role === 'guest') throw new NotFoundException('That artifact is not here')
    return found.row
  }

  async getMine(id: string, userId: string) {
    const row = await this.ownRow(id, userId)
    const versions = await this.db
      .select()
      .from(aiArtifactVersions)
      .where(eq(aiArtifactVersions.artifactId, id))
      .orderBy(desc(aiArtifactVersions.version))
    const current = versions.find((v) => v.version === row.currentVersion) ?? versions[0]
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      kind: row.kind,
      title: row.title,
      version: row.currentVersion,
      slides: current?.slides ?? [],
      versions: versions.map((v) => ({ version: v.version, title: v.title, slideCount: v.slides.length, prompt: v.prompt, restoredFrom: v.restoredFrom, createdAt: v.createdAt })),
      published: row.publishToken ? { token: row.publishToken, at: row.publishedAt } : null,
    }
  }

  /** A version written after the newest — from the model, or an old one restored — and made the one shown. */
  async addVersion(id: string, userId: string, deck: DeckInput, prompt: string, restoredFrom: number | null = null) {
    const row = await this.ownRow(id, userId)
    const [newest] = await this.db
      .select({ version: aiArtifactVersions.version })
      .from(aiArtifactVersions)
      .where(eq(aiArtifactVersions.artifactId, id))
      .orderBy(desc(aiArtifactVersions.version))
      .limit(1)
    const version = (newest?.version ?? 0) + 1
    await this.db.insert(aiArtifactVersions).values({ artifactId: row.id, version, title: deck.title, slides: deck.slides, prompt: prompt.slice(0, 4000), restoredFrom, createdById: userId })
    await this.db.update(aiArtifacts).set({ title: deck.title, currentVersion: version, updatedAt: new Date() }).where(eq(aiArtifacts.id, row.id))
    return this.getMine(id, userId)
  }

  /** ClickUp's "restore an earlier version": written again as the newest, so nothing after it is lost. */
  async restore(id: string, userId: string, version: number) {
    const row = await this.ownRow(id, userId)
    const [old] = await this.db
      .select()
      .from(aiArtifactVersions)
      .where(and(eq(aiArtifactVersions.artifactId, row.id), eq(aiArtifactVersions.version, version)))
      .limit(1)
    if (!old) throw new NotFoundException(`Version ${version} of this artifact is not here`)
    if (old.version === row.currentVersion) throw new HttpException(`Version ${version} is the one shown already`, HttpStatus.BAD_REQUEST)
    return this.addVersion(row.id, userId, { title: old.title, slides: old.slides }, `Restored version ${version}`, version)
  }

  async publish(id: string, userId: string) {
    const row = await this.ownRow(id, userId)
    if (row.publishToken) return { token: row.publishToken, at: row.publishedAt }
    const token = randomBytes(18).toString('base64url')
    const at = new Date()
    await this.db.update(aiArtifacts).set({ publishToken: token, publishedAt: at, updatedAt: at }).where(eq(aiArtifacts.id, row.id))
    return { token, at }
  }

  async unpublish(id: string, userId: string) {
    const row = await this.ownRow(id, userId)
    await this.db.update(aiArtifacts).set({ publishToken: null, publishedAt: null, updatedAt: new Date() }).where(eq(aiArtifacts.id, row.id))
    return { published: null }
  }

  /** A published deck, read by anybody with its link: its title and slides, and nothing about who made it. */
  async readPublished(token: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new NotFoundException('This link does not open anything')
    const [row] = await this.db.select().from(aiArtifacts).where(eq(aiArtifacts.publishToken, token)).limit(1)
    if (!row) throw new NotFoundException('This link does not open anything')
    const [v] = await this.db
      .select({ slides: aiArtifactVersions.slides })
      .from(aiArtifactVersions)
      .where(and(eq(aiArtifactVersions.artifactId, row.id), eq(aiArtifactVersions.version, row.currentVersion)))
      .limit(1)
    return { kind: row.kind, title: row.title, slides: v?.slides ?? [] }
  }

  async remove(id: string, userId: string) {
    const row = await this.ownRow(id, userId)
    await this.db.delete(aiArtifacts).where(eq(aiArtifacts.id, row.id))
    return { deleted: true }
  }
}
