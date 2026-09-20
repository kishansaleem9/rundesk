"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskTypeIdForOrigin = taskTypeIdForOrigin;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
/**
 * §V2-04 — the task type that stands for "a form made this" or "a meeting made
 * this", in one workspace.
 *
 * `[03:26]` "MILESTONE, FORM RESPONSE, ya MEETING NOTE se task create hue".
 * Rundesk already creates tasks from both, and neither said so on the task.
 *
 * Looked up by the `origin` marker rather than by name, because the vocabulary
 * belongs to the workspace: renaming "Form Response" to "Enquiry", or running
 * in Urdu, must not quietly stop the stamping.
 *
 * Lives here rather than on TasksService because the two callers do not share
 * one: `MeetingsService` injects TasksService, `FormsService` injects only the
 * db. A shared function keeps this to one definition without giving Forms a
 * dependency it has no other use for.
 *
 * Returns null when the workspace has no such type — a workspace may delete it,
 * and a form submission must not fail because a label is missing. The task is
 * still created; it simply carries no type, exactly as before this existed.
 */
async function taskTypeIdForOrigin(db, workspaceId, origin) {
    const [row] = await db
        .select({ id: db_1.taskTypes.id })
        .from(db_1.taskTypes)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskTypes.origin, origin)))
        // Deterministic when a workspace somehow holds two: the first one it shows
        // in its own type list is the one that gets stamped.
        .orderBy((0, drizzle_orm_1.asc)(db_1.taskTypes.position), (0, drizzle_orm_1.asc)(db_1.taskTypes.createdAt))
        .limit(1);
    return row?.id ?? null;
}
//# sourceMappingURL=origin.js.map