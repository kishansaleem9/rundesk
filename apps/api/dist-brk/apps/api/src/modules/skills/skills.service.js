"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillsService = exports.MEMORY_RECALL_LIMIT = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const skill_visibility_1 = require("./skill-visibility");
const skill_templates_1 = require("./skill-templates");
/** How many memories are recalled into a prompt. Newest first. */
exports.MEMORY_RECALL_LIMIT = 40;
let SkillsService = class SkillsService {
    constructor(db) {
        this.db = db;
    }
    templates() {
        return skill_templates_1.SKILL_TEMPLATES;
    }
    list(workspaceId, userId, tab = 'all') {
        return this.db
            .select()
            .from(db_1.skills)
            .where((0, skill_visibility_1.skillTabFilter)(tab, workspaceId, userId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.skills.updatedAt));
    }
    /**
     * Read a skill the caller is allowed to see.
     *
     * Deliberately 404 rather than 403 when the skill exists but is someone
     * else's private one: a 403 confirms the id names a real skill, which is a
     * disclosure in itself when ids can be guessed at from a shared link.
     */
    async get(workspaceId, userId, id) {
        const [row] = await this.db
            .select()
            .from(db_1.skills)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.skills.id, id), (0, skill_visibility_1.visibleSkillsFilter)(workspaceId, userId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Skill not found');
        return row;
    }
    /**
     * Editing is owner-only. Sharing a skill with the workspace shares its use,
     * not its authorship — a colleague running your Brand Voice skill must not be
     * able to quietly rewrite what it believes.
     */
    async assertOwned(workspaceId, userId, id) {
        const [row] = await this.db
            .select()
            .from(db_1.skills)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.skills.id, id), (0, drizzle_orm_1.eq)(db_1.skills.workspaceId, workspaceId)))
            .limit(1);
        // Same 404-not-403 reasoning as `get`: never confirm a stranger's id.
        if (!row)
            throw new common_1.NotFoundException('Skill not found');
        if (row.createdById !== userId)
            throw new common_1.ForbiddenException('Not your skill');
        return row;
    }
    async create(workspaceId, userId, input) {
        const name = (input.name ?? '').trim();
        if (!name)
            throw new common_1.BadRequestException('Name is required');
        const archetype = input.archetype ?? 'scratch';
        const template = (0, skill_templates_1.skillTemplate)(archetype);
        if (!template)
            throw new common_1.BadRequestException(`Unknown skill archetype: ${archetype}`);
        // A template seeds the playbook; anything the caller sent wins over it, so
        // "create from Brand Voice, but here is my own wording" does what it says.
        const instructions = input.instructions ?? template.instructions;
        try {
            const [row] = await this.db
                .insert(db_1.skills)
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
                .returning();
            // Writing a skill is choosing to use it. Leaving the author's own skill
            // out of their Enabled tab would make creating one feel like it did not
            // take, and is not how anyone would describe what they just did.
            await this.db
                .insert(db_1.skillInstalls)
                .values({ skillId: row.id, workspaceId, userId })
                .onConflictDoNothing();
            return row;
        }
        catch (err) {
            // uq_skills_ws_owner_name — one person, one skill of a given name.
            if (String(err?.code) === '23505') {
                throw new common_1.BadRequestException(`You already have a skill called "${name}"`);
            }
            throw err;
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
    async createFromProposal(workspaceId, userId, proposal) {
        const skill = await this.create(workspaceId, userId, {
            name: proposal.name,
            description: proposal.description,
            instructions: proposal.instructions,
            archetype: 'scratch',
        });
        const memories = (proposal.memories ?? [])
            .map((m) => m.trim())
            .filter(Boolean)
            .slice(0, 8);
        if (memories.length > 0) {
            await this.db.insert(db_1.skillMemories).values(memories.map((content) => ({
                skillId: skill.id,
                workspaceId,
                authorId: userId,
                // It came out of a conversation, and saying so is what makes the
                // memory list legible later.
                source: 'chat',
                content,
            })));
        }
        return { ...skill, memoriesCreated: memories.length };
    }
    async update(workspaceId, userId, id, patch) {
        await this.assertOwned(workspaceId, userId, id);
        const set = { updatedAt: new Date() };
        if (patch.name !== undefined) {
            const trimmed = patch.name.trim();
            if (!trimmed)
                throw new common_1.BadRequestException('Name cannot be empty');
            set.name = trimmed;
        }
        if (patch.description !== undefined)
            set.description = patch.description;
        if (patch.instructions !== undefined)
            set.instructions = patch.instructions;
        if (patch.visibility !== undefined)
            set.visibility = patch.visibility;
        if (patch.enabled !== undefined)
            set.enabled = patch.enabled;
        const [row] = await this.db.update(db_1.skills).set(set).where((0, drizzle_orm_1.eq)(db_1.skills.id, id)).returning();
        return row;
    }
    async remove(workspaceId, userId, id) {
        await this.assertOwned(workspaceId, userId, id);
        // Memories and connections cascade at the database, so this is one delete.
        await this.db.delete(db_1.skills).where((0, drizzle_orm_1.eq)(db_1.skills.id, id));
        return { ok: true };
    }
    /**
     * §15 — "For your team / Discover team skills / Discover skills created
     * across your workspace" (frame `285_1743`).
     *
     * No model involved: this is a real question with a real answer. What a
     * colleague published and you have not picked up is a database query, and
     * asking a model to describe it would be slower, dearer and less true.
     *
     * Ordered by how many people already use it, because on a hub full of
     * strangers' skills that is the only signal a newcomer has.
     */
    async discover(workspaceId, userId) {
        const installs = this.db.$with('installs').as(this.db
            .select({
            skillId: db_1.skillInstalls.skillId,
            installs: (0, drizzle_orm_1.sql) `count(*)::int`.as('installs'),
        })
            .from(db_1.skillInstalls)
            .groupBy(db_1.skillInstalls.skillId));
        return this.db
            .with(installs)
            .select({
            id: db_1.skills.id,
            name: db_1.skills.name,
            description: db_1.skills.description,
            archetype: db_1.skills.archetype,
            createdById: db_1.skills.createdById,
            authorName: db_1.users.displayName,
            installs: (0, drizzle_orm_1.sql) `coalesce(${installs.installs}, 0)::int`,
        })
            .from(db_1.skills)
            .leftJoin(installs, (0, drizzle_orm_1.eq)(installs.skillId, db_1.skills.id))
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.skills.createdById))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.skills.workspaceId, workspaceId), 
        // Published by someone else, still switched on, and not already
        // yours — those three are what makes it a discovery rather than a
        // list of things you are already looking at.
        (0, drizzle_orm_1.eq)(db_1.skills.visibility, 'workspace'), (0, drizzle_orm_1.eq)(db_1.skills.enabled, true), (0, drizzle_orm_1.ne)(db_1.skills.createdById, userId), (0, drizzle_orm_1.notExists)(this.db
            .select({ one: (0, drizzle_orm_1.sql) `1` })
            .from(db_1.skillInstalls)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.skillInstalls.skillId, db_1.skills.id), (0, drizzle_orm_1.eq)(db_1.skillInstalls.userId, userId))))))
            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `coalesce(${installs.installs}, 0)`), db_1.skills.name)
            .limit(50);
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
    async install(workspaceId, userId, skillId) {
        const skill = await this.get(workspaceId, userId, skillId);
        await this.db
            .insert(db_1.skillInstalls)
            .values({ skillId: skill.id, workspaceId, userId })
            .onConflictDoNothing();
        return { ok: true, installed: true };
    }
    /**
     * Uninstalling is scoped to this person and this skill, and deliberately does
     * NOT go through `get`: someone whose access was revoked after installing
     * must still be able to take it off their own list rather than being stuck
     * with a row they can no longer read.
     */
    async uninstall(workspaceId, userId, skillId) {
        await this.db
            .delete(db_1.skillInstalls)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.skillInstalls.skillId, skillId), (0, drizzle_orm_1.eq)(db_1.skillInstalls.userId, userId), (0, drizzle_orm_1.eq)(db_1.skillInstalls.workspaceId, workspaceId)));
        return { ok: true, installed: false };
    }
    /**
     * The skills this person can invoke by slash command: installed, visible, and
     * not switched off by their author.
     *
     * `enabled` is filtered HERE rather than left to the invocation check, so a
     * skill its author has disabled stops appearing in the composer's menu. It
     * would otherwise be offered, typed, and then refused — which reads as the
     * command being broken rather than the skill being off.
     */
    listInstalled(workspaceId, userId) {
        return this.db
            .select({ id: db_1.skills.id, name: db_1.skills.name })
            .from(db_1.skills)
            .where((0, drizzle_orm_1.and)((0, skill_visibility_1.visibleSkillsFilter)(workspaceId, userId), (0, drizzle_orm_1.eq)(db_1.skills.enabled, true), (0, skill_visibility_1.installedByFilter)(userId)))
            .orderBy(db_1.skills.name);
    }
    /** Which of these skills the caller has installed — one read, not N. */
    async installedIds(workspaceId, userId) {
        const rows = await this.db
            .select({ skillId: db_1.skillInstalls.skillId })
            .from(db_1.skillInstalls)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.skillInstalls.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.skillInstalls.userId, userId)));
        return rows.map((r) => r.skillId);
    }
    // ─── Memory ───────────────────────────────────────────────────────────────
    /**
     * §15 memory — [18:42]: "yeh hum jo bhi baat karenge woh STORE karega apne
     * andar." Reading a skill's memory needs only the right to see the skill;
     * writing to it is owner-only, for the reason in `assertOwned`.
     */
    async listMemories(workspaceId, userId, skillId) {
        await this.get(workspaceId, userId, skillId);
        return this.db
            .select()
            .from(db_1.skillMemories)
            .where((0, drizzle_orm_1.eq)(db_1.skillMemories.skillId, skillId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.skillMemories.createdAt));
    }
    async addMemory(workspaceId, userId, skillId, input) {
        await this.assertOwned(workspaceId, userId, skillId);
        const content = (input.content ?? '').trim();
        if (!content)
            throw new common_1.BadRequestException('Memory cannot be empty');
        const [row] = await this.db
            .insert(db_1.skillMemories)
            .values({
            skillId,
            workspaceId,
            authorId: userId,
            content,
            source: input.source ?? 'manual',
        })
            .returning();
        // Memory is part of what the skill is, so remembering counts as a change.
        await this.db.update(db_1.skills).set({ updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(db_1.skills.id, skillId));
        return row;
    }
    async removeMemory(workspaceId, userId, skillId, memoryId) {
        await this.assertOwned(workspaceId, userId, skillId);
        const result = await this.db
            .delete(db_1.skillMemories)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.skillMemories.id, memoryId), (0, drizzle_orm_1.eq)(db_1.skillMemories.skillId, skillId)))
            .returning();
        if (result.length === 0)
            throw new common_1.NotFoundException('Memory not found');
        return { ok: true };
    }
    // ─── Connections ──────────────────────────────────────────────────────────
    async listConnections(workspaceId, userId, skillId) {
        await this.get(workspaceId, userId, skillId);
        return this.db
            .select({
            id: db_1.skillConnections.id,
            skillId: db_1.skillConnections.skillId,
            provider: db_1.skillConnections.provider,
            connectionId: db_1.skillConnections.connectionId,
            config: db_1.skillConnections.config,
            createdAt: db_1.skillConnections.createdAt,
            // Null until an admin connects the provider — the binding is allowed to
            // outlive the grant, so the hub can say "waiting on a connection"
            // instead of silently dropping the row.
            status: db_1.workspaceIntegrationConnections.status,
            account: db_1.workspaceIntegrationConnections.externalAccountEmail,
        })
            .from(db_1.skillConnections)
            .leftJoin(db_1.workspaceIntegrationConnections, (0, drizzle_orm_1.eq)(db_1.skillConnections.connectionId, db_1.workspaceIntegrationConnections.id))
            .where((0, drizzle_orm_1.eq)(db_1.skillConnections.skillId, skillId))
            .orderBy(db_1.skillConnections.provider);
    }
    /**
     * Bind a skill to one of the workspace's existing integrations.
     *
     * The binding never carries a credential of its own — it points at the grant
     * the workspace already holds. That is what makes revoking the integration
     * revoke every skill leaning on it, in one move, without a sweep.
     */
    async addConnection(workspaceId, userId, skillId, input) {
        await this.assertOwned(workspaceId, userId, skillId);
        const provider = (input.provider ?? '').trim();
        if (!provider)
            throw new common_1.BadRequestException('Provider is required');
        let connectionId = null;
        if (input.connectionId) {
            // Scoped lookup, not a bare id read: without the workspace predicate a
            // caller could name a connection belonging to a workspace they have no
            // membership in and borrow its access through the skill.
            const [conn] = await this.db
                .select({ id: db_1.workspaceIntegrationConnections.id, provider: db_1.workspaceIntegrationConnections.provider })
                .from(db_1.workspaceIntegrationConnections)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.id, input.connectionId), (0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.workspaceId, workspaceId)))
                .limit(1);
            if (!conn)
                throw new common_1.NotFoundException('Integration connection not found');
            if (conn.provider !== provider) {
                throw new common_1.BadRequestException(`Connection is for ${conn.provider}, not ${provider}`);
            }
            connectionId = conn.id;
        }
        // Re-binding the same provider updates it rather than failing on the
        // unique constraint — reconnecting is a normal thing to do twice.
        const [row] = await this.db
            .insert(db_1.skillConnections)
            .values({
            skillId,
            workspaceId,
            provider,
            connectionId,
            config: input.config ?? {},
            createdById: userId,
        })
            .onConflictDoUpdate({
            target: [db_1.skillConnections.skillId, db_1.skillConnections.provider],
            set: { connectionId, config: input.config ?? {} },
        })
            .returning();
        return row;
    }
    async removeConnection(workspaceId, userId, skillId, connectionRowId) {
        await this.assertOwned(workspaceId, userId, skillId);
        const result = await this.db
            .delete(db_1.skillConnections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.skillConnections.id, connectionRowId), (0, drizzle_orm_1.eq)(db_1.skillConnections.skillId, skillId)))
            .returning();
        if (result.length === 0)
            throw new common_1.NotFoundException('Connection not found');
        return { ok: true };
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
    async buildInvocationContext(workspaceId, userId, skillId) {
        const skill = await this.get(workspaceId, userId, skillId);
        if (!skill.enabled)
            throw new common_1.BadRequestException('This skill is disabled');
        const [memories, connections] = await Promise.all([
            this.db
                .select({ content: db_1.skillMemories.content, createdAt: db_1.skillMemories.createdAt })
                .from(db_1.skillMemories)
                .where((0, drizzle_orm_1.eq)(db_1.skillMemories.skillId, skillId))
                .orderBy((0, drizzle_orm_1.desc)(db_1.skillMemories.createdAt))
                .limit(exports.MEMORY_RECALL_LIMIT),
            this.db
                .select({ provider: db_1.skillConnections.provider })
                .from(db_1.skillConnections)
                .where((0, drizzle_orm_1.eq)(db_1.skillConnections.skillId, skillId))
                .orderBy(db_1.skillConnections.provider),
        ]);
        return { skill, memories, connections };
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
    renderSkillPrompt(ctx) {
        const parts = [`You are answering as the "${ctx.skill.name}" skill.`];
        if (ctx.skill.description)
            parts.push(ctx.skill.description);
        if (ctx.skill.instructions.trim())
            parts.push('', ctx.skill.instructions.trim());
        if (ctx.memories.length > 0) {
            parts.push('', 'What this skill has been told before (most recent first) — treat it as', 'established and do not ask again:', ...ctx.memories.map((m) => `- ${m.content}`));
        }
        if (ctx.connections.length > 0) {
            parts.push('', `Connected systems: ${ctx.connections.map((c) => c.provider).join(', ')}.`);
        }
        parts.push('', 'You shape this reply; you do not take actions on your own. If the answer', 'implies doing something, say what you would do and let the person decide.');
        return parts.join('\n');
    }
    /** Counts for the hub header, in one round trip rather than three. */
    async counts(workspaceId, userId) {
        const [row] = await this.db
            .select({
            all: (0, drizzle_orm_1.sql) `count(*)::int`,
            // Matches the Enabled TAB, which is what the number sits next to — the
            // author's `enabled` flag is a different thing and counting it here
            // would put a number beside a tab that shows a different set.
            enabled: (0, drizzle_orm_1.sql) `count(*) filter (where ${(0, skill_visibility_1.installedByFilter)(userId)})::int`,
            mine: (0, drizzle_orm_1.sql) `count(*) filter (where ${db_1.skills.createdById} = ${userId})::int`,
        })
            .from(db_1.skills)
            .where((0, skill_visibility_1.visibleSkillsFilter)(workspaceId, userId));
        return row ?? { all: 0, enabled: 0, mine: 0 };
    }
};
exports.SkillsService = SkillsService;
exports.SkillsService = SkillsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], SkillsService);
//# sourceMappingURL=skills.service.js.map