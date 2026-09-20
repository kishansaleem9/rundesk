"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getListStatusContext = getListStatusContext;
exports.resolveEffectiveStatuses = resolveEffectiveStatuses;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
/**
 * Resolve which scope a list draws its statuses from, along with the owning
 * project + space ids. Returns null if the list does not exist.
 */
async function getListStatusContext(db, listId) {
    const [row] = await db
        .select({
        listId: db_1.lists.id,
        projectId: db_1.lists.projectId,
        scope: db_1.lists.statusScope,
        spaceId: db_1.projects.spaceId,
    })
        .from(db_1.lists)
        .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
        .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
        .limit(1);
    if (!row)
        return null;
    return {
        listId: row.listId,
        projectId: row.projectId,
        spaceId: row.spaceId,
        scope: (row.scope ?? 'list'),
    };
}
/**
 * Return the effective, ordered status set for a list — honouring its
 * `status_scope`. A list scoped to 'list' (the default) reads its own
 * `list_statuses`; 'project'/'space' read the shared template on the owning
 * project/space. Used by both the read endpoint and the task write path so
 * validation and display never diverge.
 */
async function resolveEffectiveStatuses(db, listId, ctx) {
    const c = ctx ?? (await getListStatusContext(db, listId));
    if (!c)
        return [];
    if (c.scope === 'project') {
        return db
            .select({
            key: db_1.projectStatuses.key,
            name: db_1.projectStatuses.name,
            color: db_1.projectStatuses.color,
            category: db_1.projectStatuses.category,
            position: db_1.projectStatuses.position,
        })
            .from(db_1.projectStatuses)
            .where((0, drizzle_orm_1.eq)(db_1.projectStatuses.projectId, c.projectId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.projectStatuses.position));
    }
    if (c.scope === 'space') {
        return db
            .select({
            key: db_1.spaceStatuses.key,
            name: db_1.spaceStatuses.name,
            color: db_1.spaceStatuses.color,
            category: db_1.spaceStatuses.category,
            position: db_1.spaceStatuses.position,
        })
            .from(db_1.spaceStatuses)
            .where((0, drizzle_orm_1.eq)(db_1.spaceStatuses.spaceId, c.spaceId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.spaceStatuses.position));
    }
    return db
        .select({
        key: db_1.listStatuses.key,
        name: db_1.listStatuses.name,
        color: db_1.listStatuses.color,
        category: db_1.listStatuses.category,
        position: db_1.listStatuses.position,
    })
        .from(db_1.listStatuses)
        .where((0, drizzle_orm_1.eq)(db_1.listStatuses.listId, listId))
        .orderBy((0, drizzle_orm_1.asc)(db_1.listStatuses.position));
}
//# sourceMappingURL=status-resolution.js.map