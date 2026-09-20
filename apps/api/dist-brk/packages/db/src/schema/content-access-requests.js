"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentAccessRequests = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * §G10 [12:16–12:20] — "someone asked for access to something".
 *
 * The `access_requested` notification kind has existed since the enum was
 * written, and was only ever emitted for FEATURE requests. Somebody who hit a
 * doc, list or space they could not see had no way to ask for it.
 *
 * Shaped after `featureFlagRequests`, and read for exactly one question: has
 * this person asked for this object lately. That is the de-dup, and it is
 * deliberately read from the ASKS rather than from the notifications they
 * produced — a notification row only exists for a recipient with in-app
 * switched on, so counting rows let an email-only owner be re-mailed on every
 * press.
 */
exports.contentAccessRequests = (0, pg_core_1.pgTable)('content_access_requests', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    // Kept in step with `object_shares.object_type` — a request for access is a
    // request for a share, so anything shareable has to be requestable.
    objectType: (0, pg_core_1.text)('object_type')
        .$type()
        .notNull(),
    objectId: (0, pg_core_1.uuid)('object_id').notNull(),
    requesterId: (0, pg_core_1.uuid)('requester_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('content_access_requests_recent_idx').on(t.workspaceId, t.objectType, t.objectId, t.requesterId, t.createdAt),
]);
//# sourceMappingURL=content-access-requests.js.map