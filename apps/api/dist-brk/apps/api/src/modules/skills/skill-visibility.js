"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.visibleSkillsFilter = visibleSkillsFilter;
exports.installedByFilter = installedByFilter;
exports.skillTabFilter = skillTabFilter;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
/**
 * §15 — who may see a skill.
 *
 * One predicate, used by every read path, because the alternative is the bug
 * class this repo has already been bitten by twice: a filter that exists on the
 * list endpoint and is quietly missing from the detail endpoint, so the thing
 * you cannot find is still readable if you know its id.
 *
 * The rule: a skill is visible inside its workspace to its owner always, and to
 * everyone else only once it has been published (`visibility = 'workspace'`).
 * `private` is the default, so writing a skill never publishes it by accident.
 */
function visibleSkillsFilter(workspaceId, userId) {
    return (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.skills.workspaceId, workspaceId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(db_1.skills.visibility, 'workspace'), (0, drizzle_orm_1.eq)(db_1.skills.createdById, userId)));
}
/**
 * "This person has installed it."
 *
 * A correlated EXISTS rather than a join: a join against `skill_installs` would
 * multiply rows the moment its unique constraint was not doing its job, so a
 * list would quietly show duplicates — a rendering bug a long way from its
 * cause. EXISTS cannot return more rows than the table it filters.
 *
 * Written as a `sql` fragment so this module stays pure and DB-free, and the
 * predicate can be rendered and asserted on without a connection.
 */
function installedByFilter(userId) {
    return (0, drizzle_orm_1.sql) `exists (select 1 from ${db_1.skillInstalls} where ${db_1.skillInstalls.skillId} = ${db_1.skills.id} and ${db_1.skillInstalls.userId} = ${userId})`;
}
function skillTabFilter(tab, workspaceId, userId) {
    const base = visibleSkillsFilter(workspaceId, userId);
    if (tab === 'enabled')
        return (0, drizzle_orm_1.and)(base, installedByFilter(userId));
    if (tab === 'mine')
        return (0, drizzle_orm_1.and)(base, (0, drizzle_orm_1.eq)(db_1.skills.createdById, userId));
    return base;
}
//# sourceMappingURL=skill-visibility.js.map