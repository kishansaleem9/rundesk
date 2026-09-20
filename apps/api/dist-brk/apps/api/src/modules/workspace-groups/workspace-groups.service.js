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
exports.WorkspaceGroupsService = void 0;
exports.normalizeGroupAlias = normalizeGroupAlias;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const security_service_1 = require("../security/security.service");
/**
 * §A4.3 — an @-handle has to survive being typed by a human mid-sentence, so it
 * is reduced to the character set a mention parser can bound: lowercase
 * alphanumerics plus `-`/`_`. Returns null when nothing usable survives, which
 * leaves the team un-mentionable rather than reachable under a mangled handle.
 */
function normalizeGroupAlias(raw) {
    if (typeof raw !== 'string')
        return null;
    const cleaned = raw
        .trim()
        .replace(/^@+/, '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '')
        .slice(0, 32);
    return cleaned.length >= 2 ? cleaned : null;
}
let WorkspaceGroupsService = class WorkspaceGroupsService {
    constructor(db, security) {
        this.db = db;
        this.security = security;
    }
    async list(workspaceId, opts = {}) {
        const where = opts.search
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceGroups.workspaceId, workspaceId), (0, drizzle_orm_1.ilike)(db_1.workspaceGroups.name, `%${opts.search}%`))
            : (0, drizzle_orm_1.eq)(db_1.workspaceGroups.workspaceId, workspaceId);
        const groups = await this.db.select().from(db_1.workspaceGroups).where(where).orderBy(db_1.workspaceGroups.name);
        if (groups.length === 0)
            return [];
        const ids = groups.map((g) => g.id);
        const memberRows = await this.db
            .select({
            groupId: db_1.workspaceGroupMembers.groupId,
            userId: db_1.workspaceGroupMembers.userId,
            email: db_1.users.email,
            displayName: db_1.users.displayName,
        })
            .from(db_1.workspaceGroupMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceGroupMembers.userId))
            .where((0, drizzle_orm_1.inArray)(db_1.workspaceGroupMembers.groupId, ids));
        const grouped = new Map();
        for (const row of memberRows) {
            if (!grouped.has(row.groupId))
                grouped.set(row.groupId, []);
            grouped.get(row.groupId).push(row);
        }
        return groups.map((g) => ({
            ...g,
            members: (grouped.get(g.id) ?? []).map((r) => ({
                userId: r.userId,
                email: r.email,
                displayName: r.displayName,
            })),
            memberCount: grouped.get(g.id)?.length ?? 0,
        }));
    }
    async get(workspaceId, groupId) {
        const [group] = await this.db
            .select()
            .from(db_1.workspaceGroups)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceGroups.id, groupId), (0, drizzle_orm_1.eq)(db_1.workspaceGroups.workspaceId, workspaceId)))
            .limit(1);
        if (!group)
            throw new common_1.NotFoundException(`Group ${groupId} not found`);
        const members = await this.db
            .select({
            userId: db_1.workspaceGroupMembers.userId,
            email: db_1.users.email,
            displayName: db_1.users.displayName,
            avatarUrl: db_1.users.avatarUrl,
        })
            .from(db_1.workspaceGroupMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceGroupMembers.userId))
            .where((0, drizzle_orm_1.eq)(db_1.workspaceGroupMembers.groupId, groupId));
        return { ...group, members };
    }
    /** Resolve a group by SCIM externalId or by id, scoped to workspace. */
    async findByIdOrExternal(workspaceId, key) {
        const [row] = await this.db
            .select()
            .from(db_1.workspaceGroups)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceGroups.workspaceId, workspaceId), (0, drizzle_orm_1.sql) `(${db_1.workspaceGroups.id}::text = ${key} OR ${db_1.workspaceGroups.externalId} = ${key})`))
            .limit(1);
        return row ?? null;
    }
    async create(workspaceId, actorId, input) {
        if (typeof input.name !== 'string' || !input.name.trim())
            throw new common_1.BadRequestException('Group name is required');
        // Coerce a non-array memberIds (e.g. a stray string) to empty — otherwise
        // `.length`/`.map` on a non-array threw and surfaced as a 500.
        const memberIds = Array.isArray(input.memberIds) ? input.memberIds : [];
        if (memberIds.length > 0)
            await this.assertMembersOfWorkspace(workspaceId, memberIds);
        // §A4.3 — every team gets a handle, derived from its name when the caller
        // does not supply one, so a group created by SCIM is mentionable too.
        const alias = await this.resolveAlias(workspaceId, normalizeGroupAlias(input.alias) ?? input.name);
        try {
            const [created] = await this.db
                .insert(db_1.workspaceGroups)
                .values({
                workspaceId,
                name: input.name.trim(),
                description: input.description ?? null,
                externalId: input.externalId ?? null,
                alias,
                createdById: actorId,
            })
                .returning();
            if (memberIds.length > 0) {
                await this.db
                    .insert(db_1.workspaceGroupMembers)
                    .values(memberIds.map((userId) => ({ groupId: created.id, userId })))
                    .onConflictDoNothing();
            }
            await this.security.logAuditEvent({
                workspaceId,
                actorId: actorId ?? undefined,
                action: 'group.created',
                resourceType: 'workspace_group',
                resourceId: created.id,
                description: `Created group "${created.name}"`,
                metadata: { name: created.name, memberCount: memberIds.length },
            });
            return this.get(workspaceId, created.id);
        }
        catch (err) {
            if (err?.code === '23505') {
                throw new common_1.ConflictException(`A group named "${input.name}" already exists`);
            }
            throw err;
        }
    }
    async update(workspaceId, groupId, actorId, input) {
        const existing = await this.get(workspaceId, groupId);
        const patch = { updatedAt: new Date() };
        if (input.name !== undefined && input.name.trim() && input.name.trim() !== existing.name) {
            patch.name = input.name.trim();
        }
        if (input.description !== undefined)
            patch.description = input.description;
        if (input.externalId !== undefined)
            patch.externalId = input.externalId;
        if (input.alias !== undefined) {
            const desired = normalizeGroupAlias(input.alias);
            // An explicitly blank alias removes the handle; anything else is claimed,
            // suffixed if a sibling team already answers to it.
            patch.alias = desired ? await this.resolveAlias(workspaceId, desired, groupId) : null;
        }
        if (Object.keys(patch).length > 1) {
            await this.db.update(db_1.workspaceGroups).set(patch).where((0, drizzle_orm_1.eq)(db_1.workspaceGroups.id, groupId));
            await this.security.logAuditEvent({
                workspaceId,
                actorId: actorId ?? undefined,
                action: 'group.updated',
                resourceType: 'workspace_group',
                resourceId: groupId,
                description: `Updated group "${existing.name}"`,
                metadata: { fields: Object.keys(patch).filter((k) => k !== 'updatedAt').join(',') },
            });
        }
        return this.get(workspaceId, groupId);
    }
    async remove(workspaceId, groupId, actorId) {
        const existing = await this.get(workspaceId, groupId);
        await this.db.delete(db_1.workspaceGroups).where((0, drizzle_orm_1.eq)(db_1.workspaceGroups.id, groupId));
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actorId ?? undefined,
            action: 'group.deleted',
            resourceType: 'workspace_group',
            resourceId: groupId,
            description: `Deleted group "${existing.name}"`,
        });
        return { ok: true };
    }
    async addMembers(workspaceId, groupId, actorId, userIds) {
        const existing = await this.get(workspaceId, groupId);
        if (userIds.length === 0)
            return existing;
        await this.assertMembersOfWorkspace(workspaceId, userIds);
        await this.db
            .insert(db_1.workspaceGroupMembers)
            .values(userIds.map((userId) => ({ groupId, userId })))
            .onConflictDoNothing();
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actorId ?? undefined,
            action: 'group.members_added',
            resourceType: 'workspace_group',
            resourceId: groupId,
            description: `Added ${userIds.length} member${userIds.length === 1 ? '' : 's'} to "${existing.name}"`,
            metadata: { count: userIds.length },
        });
        return this.get(workspaceId, groupId);
    }
    async removeMember(workspaceId, groupId, actorId, userId) {
        const existing = await this.get(workspaceId, groupId);
        await this.db
            .delete(db_1.workspaceGroupMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceGroupMembers.groupId, groupId), (0, drizzle_orm_1.eq)(db_1.workspaceGroupMembers.userId, userId)));
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actorId ?? undefined,
            action: 'group.member_removed',
            resourceType: 'workspace_group',
            resourceId: groupId,
            description: `Removed member from "${existing.name}"`,
            metadata: { userId },
        });
        return this.get(workspaceId, groupId);
    }
    /**
     * Replace the entire member set. Used by SCIM PUT and by admin bulk edits.
     * Returns the refreshed group payload.
     */
    async replaceMembers(workspaceId, groupId, actorId, userIds) {
        const existing = await this.get(workspaceId, groupId);
        if (userIds.length > 0)
            await this.assertMembersOfWorkspace(workspaceId, userIds);
        await this.db.transaction(async (tx) => {
            await tx.delete(db_1.workspaceGroupMembers).where((0, drizzle_orm_1.eq)(db_1.workspaceGroupMembers.groupId, groupId));
            if (userIds.length > 0) {
                await tx
                    .insert(db_1.workspaceGroupMembers)
                    .values(userIds.map((userId) => ({ groupId, userId })))
                    .onConflictDoNothing();
            }
        });
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actorId ?? undefined,
            action: 'group.members_replaced',
            resourceType: 'workspace_group',
            resourceId: groupId,
            description: `Replaced member set on "${existing.name}" (${userIds.length} members)`,
            metadata: { count: userIds.length },
        });
        return this.get(workspaceId, groupId);
    }
    /**
     * §V2-12 / frame `21:00` — the per-person work preview cards.
     *
     * The frame draws one card per person: avatar, name, job title, then a
     * NUMBERED list of what that person is working on — Priya Gupta's five items
     * beside Sarah Chang's five different ones. So the whole content of the
     * feature is that each card answers for ITS OWN person.
     *
     * WHICH IS THE PART THAT IS EASY TO FAKE, and this audit has found both
     * halves of the fake in shipped code:
     *
     *   - the FACADE: every card rendering the same list (the caller's own work,
     *     or the first person's), which looks perfect until two people have
     *     different work;
     *   - the CONFIDENT ZERO: a count that is always 0 because the grouping keyed
     *     on the wrong id. In the UI that is indistinguishable from a person who
     *     genuinely has nothing on.
     *
     * So: ONE query for everybody's open work, grouped in memory on
     * `task_assignees.user_id` — the key that was selected, not one reconstructed
     * afterwards — and `openCount` is the true total for that person, not the
     * length of the slice the card shows. A card that says 12 and lists 5 is
     * correct; a card that says 5 because it counted its own list is a number
     * that can never disagree with the list, which makes it decoration.
     *
     * Tasks reach a workspace only through list → project → space, the same join
     * chain the person profile and the activity feed use. `isArchived` covers
     * both archived and trashed tasks (see the note in schema/tasks.ts), so
     * neither shows up as somebody's current work.
     */
    async workPreview(workspaceId, opts = {}) {
        const limit = Math.min(Math.max(Math.trunc(opts.perPerson ?? 5) || 5, 1), 10);
        const people = await this.db
            .select({
            userId: db_1.workspaceMembers.userId,
            displayName: db_1.users.displayName,
            email: db_1.users.email,
            avatarUrl: db_1.users.avatarUrl,
            role: db_1.workspaceMembers.role,
            jobTitle: db_1.workspaceMemberProfiles.jobTitle,
        })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
            .leftJoin(db_1.workspaceMemberProfiles, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMemberProfiles.userId, db_1.workspaceMembers.userId), (0, drizzle_orm_1.eq)(db_1.workspaceMemberProfiles.workspaceId, workspaceId)))
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId))
            .orderBy(db_1.users.displayName);
        if (people.length === 0)
            return [];
        const ids = people.map((p) => p.userId);
        const rows = await this.db
            .select({
            userId: db_1.taskAssignees.userId,
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            statusCategory: db_1.tasks.statusCategory,
            dueDate: db_1.tasks.dueDate,
            listId: db_1.tasks.listId,
        })
            .from(db_1.taskAssignees)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.taskAssignees.userId, ids), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.ne)(db_1.tasks.statusCategory, 'closed')))
            // Soonest first, undated last — the order the card's 1…5 numbering means.
            .orderBy((0, drizzle_orm_1.sql) `${db_1.tasks.dueDate} asc nulls last`, db_1.tasks.position, db_1.tasks.title);
        const byPerson = new Map();
        for (const row of rows) {
            const bucket = byPerson.get(row.userId);
            if (bucket)
                bucket.push(row);
            else
                byPerson.set(row.userId, [row]);
        }
        return people.map((person) => {
            const own = byPerson.get(person.userId) ?? [];
            return {
                userId: person.userId,
                displayName: person.displayName,
                email: person.email,
                avatarUrl: person.avatarUrl,
                role: person.role,
                jobTitle: person.jobTitle ?? null,
                /** Everything open, not the slice below. */
                openCount: own.length,
                items: own.slice(0, limit).map((r) => ({
                    id: r.id,
                    title: r.title,
                    status: r.status,
                    statusCategory: r.statusCategory,
                    dueDate: r.dueDate,
                    listId: r.listId,
                })),
            };
        });
    }
    /**
     * The job title under the name on a person card.
     *
     * Yours, or anybody's if you administer the workspace. Not a free-for-all:
     * a title is what the org says you do, and letting any colleague rewrite it
     * makes the card unusable as an answer to "who is this".
     *
     * Upsert on (workspace, user) so a second save edits rather than duplicates;
     * clearing it back to NULL is a legitimate answer, distinct from never having
     * been asked, and the card falls back to the workspace role for neither — it
     * simply says nothing.
     */
    async setJobTitle(workspaceId, actorId, userId, rawTitle) {
        const [actor] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actorId)))
            .limit(1);
        const isAdmin = !!actor && ['workspace_admin', 'manager', 'super_admin'].includes(actor.role);
        if (actorId !== userId && !isAdmin) {
            throw new common_1.ForbiddenException('Only a workspace admin may change somebody else’s job title');
        }
        const [target] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!target)
            throw new common_1.NotFoundException('That person is not a member of this workspace');
        const trimmed = typeof rawTitle === 'string' ? rawTitle.trim().slice(0, 120) : '';
        const jobTitle = trimmed.length > 0 ? trimmed : null;
        const [row] = await this.db
            .insert(db_1.workspaceMemberProfiles)
            .values({ workspaceId, userId, jobTitle })
            .onConflictDoUpdate({
            target: [db_1.workspaceMemberProfiles.workspaceId, db_1.workspaceMemberProfiles.userId],
            set: { jobTitle, updatedAt: new Date() },
        })
            .returning();
        return { userId, jobTitle: row?.jobTitle ?? null };
    }
    /**
     * Claim a free handle in this workspace, suffixing `-2`, `-3`… on collision.
     * The unique index is still the authority; this only keeps the common case
     * from surfacing as a 409 the admin has to resolve by hand.
     */
    async resolveAlias(workspaceId, desired, excludeGroupId) {
        const base = normalizeGroupAlias(desired);
        if (!base)
            return null;
        const taken = await this.db
            .select({ alias: db_1.workspaceGroups.alias, id: db_1.workspaceGroups.id })
            .from(db_1.workspaceGroups)
            .where((0, drizzle_orm_1.eq)(db_1.workspaceGroups.workspaceId, workspaceId));
        const used = new Set(taken.filter((r) => r.id !== excludeGroupId && r.alias).map((r) => r.alias.toLowerCase()));
        if (!used.has(base))
            return base;
        for (let n = 2; n < 100; n++) {
            const candidate = `${base.slice(0, 29)}-${n}`;
            if (!used.has(candidate))
                return candidate;
        }
        return null;
    }
    async assertMembersOfWorkspace(workspaceId, userIds) {
        const valid = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.userId, userIds)));
        const validSet = new Set(valid.map((v) => v.userId));
        const missing = userIds.filter((id) => !validSet.has(id));
        if (missing.length > 0) {
            throw new common_1.BadRequestException(`These users are not workspace members and cannot be added to a group: ${missing.join(', ')}`);
        }
    }
};
exports.WorkspaceGroupsService = WorkspaceGroupsService;
exports.WorkspaceGroupsService = WorkspaceGroupsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, security_service_1.SecurityService])
], WorkspaceGroupsService);
//# sourceMappingURL=workspace-groups.service.js.map