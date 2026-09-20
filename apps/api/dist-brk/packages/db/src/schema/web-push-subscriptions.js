"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webPushSubscriptions = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.webPushSubscriptions = (0, pg_core_1.pgTable)('web_push_subscriptions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    endpoint: (0, pg_core_1.text)('endpoint').notNull(),
    p256dh: (0, pg_core_1.text)('p256dh').notNull(),
    auth: (0, pg_core_1.text)('auth').notNull(),
    userAgent: (0, pg_core_1.text)('user_agent'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqueUserEndpoint: (0, pg_core_1.unique)('uq_web_push_user_endpoint').on(t.userId, t.endpoint),
    uniqueEndpoint: (0, pg_core_1.unique)('uq_web_push_endpoint').on(t.endpoint),
    userIdx: (0, pg_core_1.index)('idx_web_push_subscriptions_user').on(t.userId),
}));
//# sourceMappingURL=web-push-subscriptions.js.map