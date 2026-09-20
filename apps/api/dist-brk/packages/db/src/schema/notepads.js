"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userNotepads = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
/**
 * §6 frame `087_0535` — the "Notepad" row in Personal Tools.
 *
 * A personal scratch pad, one row per person. Deliberately not a document
 * system: Docs already exist for anything wanting a title, sharing or a place
 * in the tree, and two ways to write a paragraph is how they drift.
 *
 * Not workspace-scoped. It belongs to the person, as ClickUp's does — a
 * thought jotted in one workspace vanishing when they switch would be the
 * opposite of a scratch pad.
 */
exports.userNotepads = (0, pg_core_1.pgTable)('user_notepads', {
    userId: (0, pg_core_1.uuid)('user_id').primaryKey().references(() => users_1.users.id, { onDelete: 'cascade' }),
    content: (0, pg_core_1.text)('content').notNull().default(''),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
//# sourceMappingURL=notepads.js.map