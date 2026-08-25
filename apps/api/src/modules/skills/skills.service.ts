import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, desc, eq, sql } from 'drizzle-orm'
import {
  skillConnections,
  skillInstalls,
  skillMemories,
  skills,
  workspaceIntegrationConnections,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import {
  installedByFilter,
  skillTabFilter,
  visibleSkillsFilter,
  type SkillTab,
} from './skill-visibility'
import { SKILL_TEMPLATES, skillTemplate } from './skill-templates'
import type { SkillProposal } from './skill-proposal'

/** How many memories are recalled into a prompt. Newest first. */
export const MEMORY_RECALL_LIMIT = 40

@Injectable()
export class SkillsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  templates() {
    return SKILL_TEMPLATES
  }

  list(workspaceId: string, userId: string, tab: SkillTab = 'all') {
    return this.db
      .select()
      .from(skills)
      .where(skillTabFilter(tab, workspaceId, userId))
      .orderBy(desc(skills.updatedAt))
  }

  /**
   * Read a skill the caller is allowed to see.
   *
   * Deliberately 404 rather than 403 when the skill exists but is someone
   * else's private one: a 403 confirms the id names a real skill, which is a
   * disclosure in itself when ids can be guessed at from a shared link.
   */
  async get(workspaceId: string, userId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(skills)
      .where(and(eq(skills.id, id), visibleSkillsFilter(workspaceId, userId)))
      .limit(1)
    if (!row) throw new NotFoundException('Skill not found')
    return row
  }

  /**
   * Editing is owner-only. Sharing a skill with the workspace shares its use,
   * not its authorship — a colleague running your Brand Voice skill must not be
   * able to quietly rewrite what it believes.
   */
  private async assertOwned(workspaceId: string, userId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(skills)
      .where(and(eq(skills.id, id), eq(skills.workspaceId, workspaceId)))
      .limit(1)
    // Same 404-not-403 reasoning as `get`: never confirm a stranger's id.
    if (!row) throw new NotFoundException('Skill not found')
    if (row.createdById !== userId) throw new ForbiddenException('Not your skill')
    return row
  }

  async create(
    workspaceId: string,
    userId: string,
    input: {
      name: string
      description?: string
      instructions?: string
      archetype?: string
      visibility?: 'private' | 'workspace'
      enabled?: boolean
    },
  ) {
    const name = (input.name ?? '').trim()
    if (!name) throw new BadRequestException('Name is required')

    const archetype = input.archetype ?? 'scratch'
    const template = skillTemplate(archetype)
    if (!template) throw new BadRequestException(`Unknown skill archetype: ${archetype}`)

    // A template seeds the playbook; anything the caller sent wins over it, so
    // "create from Brand Voice, but here is my own wording" does what it says.
    const instructions = input.instructions ?? template.instructions

    try {
      const [row] = await this.db
        .insert(skills)
        .values({
          workspaceId,
          createdById: userId,
          name,
          description: input.description?.trim() || template.description || null,
          instructions,
          archetype: template.archetype,
          visibility: input.visibility ?? 'private',
          enabled: input.enabled ?? true,
        })
        .returning()
      // Writing a skill is choosing to use it. Leaving the author's own skill
      // out of their Enabled tab would make creating one feel like it did not
      // take, and is not how anyone would describe what they just did.
      await this.db
        .insert(skillInstalls)
        .values({ skillId: row.id, workspaceId, userId })
        .onConflictDoNothing()
      return row
    } catch (err) {
      // uq_skills_ws_owner_name — one person, one skill of a given name.
      if (String((err as { code?: string })?.code) === '23505') {
        throw new BadRequestException(`You already have a skill called "${name}"`)
      }
      throw err
    }
  }

  /**
   * §15 — the approval half of the gate, frame `t1146`: "Approve this approach
   * and I'll create it."
   *
   * One call, because approving is one decision. Creating the skill and then
   * separately writing its memory would leave a skill that was approved with
   * memory and shipped without it if the second call failed — and nobody would
   * see that happen.
   *
   * The proposal is treated as untrusted input, not as something the server
   * said earlier: it round-trips through the client, so it goes through the
   * same `create` path — the same name check, the same ownership from the
   * token, the same private default — as anything typed by hand.
   */
  async createFromProposal(
    workspaceId: string,
    userId: string,
    proposal: Pick<SkillProposal, 'name' | 'instructions'> & {
      description?: string
      memories?: string[]
    },
  ) {
    const skill = await this.create(workspaceId, userId, {
      name: proposal.name,
      description: proposal.description,
      instructions: proposal.instructions,
      archetype: 'scratch',
    })

    const memories = (proposal.memories ?? [])
      .map((m) => m.trim())
      .filter(Boolean)
      .slice(0, 8)
    if (memories.length > 0) {
      await this.db.insert(skillMemories).values(
        memories.map((content) => ({
          skillId: skill.id,
          workspaceId,
          authorId: userId,
          // It came out of a conversation, and saying so is what makes the
          // memory list legible later.
          source: 'chat' as const,
          content,
        })),
      )
    }
    return { ...skill, memoriesCreated: memories.length }
  }

  async update(
    workspaceId: string,
    userId: string,
    id: string,
    patch: {
      name?: string
      description?: string | null
      instructions?: string
      visibility?: 'private' | 'workspace'
      enabled?: boolean
    },
  ) {
    await this.assertOwned(workspaceId, userId, id)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim()
      if (!trimmed) throw new BadRequestException('Name cannot be empty')
      set.name = trimmed
    }
    if (patch.description !== undefined) set.description = patch.description
    if (patch.instructions !== undefined) set.instructions = patch.instructions
    if (patch.visibility !== undefined) set.visibility = patch.visibility
    if (patch.enabled !== undefined) set.enabled = patch.enabled
    const [row] = await this.db.update(skills).set(set).where(eq(skills.id, id)).returning()
    return row
  }

  async remove(workspaceId: string, userId: string, id: string) {
    await this.assertOwned(workspaceId, userId, id)
    // Memories and connections cascade at the database, so this is one delete.
    await this.db.delete(skills).where(eq(skills.id, id))
    return { ok: true }
  }

  // ─── Installing ───────────────────────────────────────────────────────────

  /**
   * §15 — "browse, install, and manage".
   *
   * Installing needs only the right to SEE the skill, which is the whole point
   * of publishing one: a colleague picks it up without needing anything from
   * its author. It is also idempotent, because a hub button pressed twice
   * means the same thing as pressed once.
   */
  async install(workspaceId: string, userId: string, skillId: string) {
    const skill = await this.get(workspaceId, userId, skillId)
    await this.db
      .insert(skillInstalls)
      .values({ skillId: skill.id, workspaceId, userId })
      .onConflictDoNothing()
    return { ok: true, installed: true }
  }

  /**
   * Uninstalling is scoped to this person and this skill, and deliberately does
   * NOT go through `get`: someone whose access was revoked after installing
   * must still be able to take it off their own list rather than being stuck
   * with a row they can no longer read.
   */
  async uninstall(workspaceId: string, userId: string, skillId: string) {
    await this.db
      .delete(skillInstalls)
      .where(
        and(
          eq(skillInstalls.skillId, skillId),
          eq(skillInstalls.userId, userId),
          eq(skillInstalls.workspaceId, workspaceId),
        ),
      )
    return { ok: true, installed: false }
  }

  /** Which of these skills the caller has installed — one read, not N. */
  async installedIds(workspaceId: string, userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ skillId: skillInstalls.skillId })
      .from(skillInstalls)
      .where(and(eq(skillInstalls.workspaceId, workspaceId), eq(skillInstalls.userId, userId)))
    return rows.map((r) => r.skillId)
  }

  // ─── Memory ───────────────────────────────────────────────────────────────

  /**
   * §15 memory — [18:42]: "yeh hum jo bhi baat karenge woh STORE karega apne
   * andar." Reading a skill's memory needs only the right to see the skill;
   * writing to it is owner-only, for the reason in `assertOwned`.
   */
  async listMemories(workspaceId: string, userId: string, skillId: string) {
    await this.get(workspaceId, userId, skillId)
    return this.db
      .select()
      .from(skillMemories)
      .where(eq(skillMemories.skillId, skillId))
      .orderBy(desc(skillMemories.createdAt))
  }

  async addMemory(
    workspaceId: string,
    userId: string,
    skillId: string,
    input: { content: string; source?: 'chat' | 'manual' },
  ) {
    await this.assertOwned(workspaceId, userId, skillId)
    const content = (input.content ?? '').trim()
    if (!content) throw new BadRequestException('Memory cannot be empty')
    const [row] = await this.db
      .insert(skillMemories)
      .values({
        skillId,
        workspaceId,
        authorId: userId,
        content,
        source: input.source ?? 'manual',
      })
      .returning()
    // Memory is part of what the skill is, so remembering counts as a change.
    await this.db.update(skills).set({ updatedAt: new Date() }).where(eq(skills.id, skillId))
    return row
  }

  async removeMemory(workspaceId: string, userId: string, skillId: string, memoryId: string) {
    await this.assertOwned(workspaceId, userId, skillId)
    const result = await this.db
      .delete(skillMemories)
      .where(and(eq(skillMemories.id, memoryId), eq(skillMemories.skillId, skillId)))
      .returning()
    if (result.length === 0) throw new NotFoundException('Memory not found')
    return { ok: true }
  }

  // ─── Connections ──────────────────────────────────────────────────────────

  async listConnections(workspaceId: string, userId: string, skillId: string) {
    await this.get(workspaceId, userId, skillId)
    return this.db
      .select({
        id: skillConnections.id,
        skillId: skillConnections.skillId,
        provider: skillConnections.provider,
        connectionId: skillConnections.connectionId,
        config: skillConnections.config,
        createdAt: skillConnections.createdAt,
        // Null until an admin connects the provider — the binding is allowed to
        // outlive the grant, so the hub can say "waiting on a connection"
        // instead of silently dropping the row.
        status: workspaceIntegrationConnections.status,
        account: workspaceIntegrationConnections.externalAccountEmail,
      })
      .from(skillConnections)
      .leftJoin(
        workspaceIntegrationConnections,
        eq(skillConnections.connectionId, workspaceIntegrationConnections.id),
      )
      .where(eq(skillConnections.skillId, skillId))
      .orderBy(skillConnections.provider)
  }

  /**
   * Bind a skill to one of the workspace's existing integrations.
   *
   * The binding never carries a credential of its own — it points at the grant
   * the workspace already holds. That is what makes revoking the integration
   * revoke every skill leaning on it, in one move, without a sweep.
   */
  async addConnection(
    workspaceId: string,
    userId: string,
    skillId: string,
    input: { provider: string; connectionId?: string; config?: Record<string, unknown> },
  ) {
    await this.assertOwned(workspaceId, userId, skillId)
    const provider = (input.provider ?? '').trim()
    if (!provider) throw new BadRequestException('Provider is required')

    let connectionId: string | null = null
    if (input.connectionId) {
      // Scoped lookup, not a bare id read: without the workspace predicate a
      // caller could name a connection belonging to a workspace they have no
      // membership in and borrow its access through the skill.
      const [conn] = await this.db
        .select({ id: workspaceIntegrationConnections.id, provider: workspaceIntegrationConnections.provider })
        .from(workspaceIntegrationConnections)
        .where(
          and(
            eq(workspaceIntegrationConnections.id, input.connectionId),
            eq(workspaceIntegrationConnections.workspaceId, workspaceId),
          ),
        )
        .limit(1)
      if (!conn) throw new NotFoundException('Integration connection not found')
      if (conn.provider !== provider) {
        throw new BadRequestException(
          `Connection is for ${conn.provider}, not ${provider}`,
        )
      }
      connectionId = conn.id
    }

    // Re-binding the same provider updates it rather than failing on the
    // unique constraint — reconnecting is a normal thing to do twice.
    const [row] = await this.db
      .insert(skillConnections)
      .values({
        skillId,
        workspaceId,
        provider,
        connectionId,
        config: input.config ?? {},
        createdById: userId,
      })
      .onConflictDoUpdate({
        target: [skillConnections.skillId, skillConnections.provider],
        set: { connectionId, config: input.config ?? {} },
      })
      .returning()
    return row
  }

  async removeConnection(
    workspaceId: string,
    userId: string,
    skillId: string,
    connectionRowId: string,
  ) {
    await this.assertOwned(workspaceId, userId, skillId)
    const result = await this.db
      .delete(skillConnections)
      .where(and(eq(skillConnections.id, connectionRowId), eq(skillConnections.skillId, skillId)))
      .returning()
    if (result.length === 0) throw new NotFoundException('Connection not found')
    return { ok: true }
  }

  // ─── Invocation ───────────────────────────────────────────────────────────

  /**
   * Everything the assistant needs to answer *as* this skill: the playbook, the
   * memory it has accumulated, and the systems it is allowed to draw on.
   *
   * A disabled skill cannot be invoked — her library's Enabled tab is a switch,
   * not a label — and the check is here, on the one path that builds a prompt,
   * rather than on each caller.
   */
  async buildInvocationContext(workspaceId: string, userId: string, skillId: string) {
    const skill = await this.get(workspaceId, userId, skillId)
    if (!skill.enabled) throw new BadRequestException('This skill is disabled')

    const [memories, connections] = await Promise.all([
      this.db
        .select({ content: skillMemories.content, createdAt: skillMemories.createdAt })
        .from(skillMemories)
        .where(eq(skillMemories.skillId, skillId))
        .orderBy(desc(skillMemories.createdAt))
        .limit(MEMORY_RECALL_LIMIT),
      this.db
        .select({ provider: skillConnections.provider })
        .from(skillConnections)
        .where(eq(skillConnections.skillId, skillId))
        .orderBy(skillConnections.provider),
    ])

    return { skill, memories, connections }
  }

  /**
   * Render that context as a system-prompt fragment.
   *
   * The last paragraph is the boundary, and it is deliberate: a skill shapes a
   * reply, it does not act unattended. Nothing in the video shows a skill
   * running on its own — even the assistant authoring one stops to ask
   * ("Approve this approach and I'll create it", [18:58]). Connections are
   * named here so the model knows what it may cite, not so it may reach out.
   */
  renderSkillPrompt(ctx: {
    skill: { name: string; description: string | null; instructions: string }
    memories: Array<{ content: string }>
    connections: Array<{ provider: string }>
  }): string {
    const parts = [`You are answering as the "${ctx.skill.name}" skill.`]
    if (ctx.skill.description) parts.push(ctx.skill.description)
    if (ctx.skill.instructions.trim()) parts.push('', ctx.skill.instructions.trim())

    if (ctx.memories.length > 0) {
      parts.push(
        '',
        'What this skill has been told before (most recent first) — treat it as',
        'established and do not ask again:',
        ...ctx.memories.map((m) => `- ${m.content}`),
      )
    }

    if (ctx.connections.length > 0) {
      parts.push(
        '',
        `Connected systems: ${ctx.connections.map((c) => c.provider).join(', ')}.`,
      )
    }

    parts.push(
      '',
      'You shape this reply; you do not take actions on your own. If the answer',
      'implies doing something, say what you would do and let the person decide.',
    )
    return parts.join('\n')
  }

  /** Counts for the hub header, in one round trip rather than three. */
  async counts(workspaceId: string, userId: string) {
    const [row] = await this.db
      .select({
        all: sql<number>`count(*)::int`,
        // Matches the Enabled TAB, which is what the number sits next to — the
        // author's `enabled` flag is a different thing and counting it here
        // would put a number beside a tab that shows a different set.
        enabled: sql<number>`count(*) filter (where ${installedByFilter(userId)})::int`,
        mine: sql<number>`count(*) filter (where ${skills.createdById} = ${userId})::int`,
      })
      .from(skills)
      .where(visibleSkillsFilter(workspaceId, userId))
    return row ?? { all: 0, enabled: 0, mine: 0 }
  }
}
