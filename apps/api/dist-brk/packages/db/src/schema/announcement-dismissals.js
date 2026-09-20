"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.announcementDismissalsRelations = exports.announcementDismissals = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const announcements_1 = require("./announcements");
const users_1 = require("./users");
exports.announcementDismissals = (0, pg_core_1.pgTable)('announcement_dismissals', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    announcementId: (0, pg_core_1.uuid)('announcement_id')
        .notNull()
        .references(() => announcements_1.announcements.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    dismissedAt: (0, pg_core_1.timestamp)('dismissed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    uniqueAnnouncementDismissalPerUser: (0, pg_core_1.uniqueIndex)('announcement_dismissals_unique_announcement_user').on(table.announcementId, table.userId),
}));
exports.announcementDismissalsRelations = (0, drizzle_orm_1.relations)(exports.announcementDismissals, ({ one }) => ({
    announcement: one(announcements_1.announcements, {
        fields: [exports.announcementDismissals.announcementId],
        references: [announcements_1.announcements.id],
    }),
    user: one(users_1.users, {
        fields: [exports.announcementDismissals.userId],
        references: [users_1.users.id],
    }),
}));
//# sourceMappingURL=announcement-dismissals.js.map