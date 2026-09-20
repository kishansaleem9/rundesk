"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBLIC_USER_WITH = exports.PUBLIC_USER_COLUMNS = void 0;
const db_1 = require("@rundesk/db");
/**
 * The only user columns that may leave the server when a user is embedded in
 * someone else's payload — a task's creator, a comment's author, a watcher.
 *
 * The `users` row carries `passwordHash`, `failedLoginAttempts`, `lockedUntil`
 * and the owner's private `notificationPreferences`. Drizzle's `with: { user:
 * true }` and `.select({ user: users })` both take the whole row, so embedding a
 * user was shipping all of that to every workspace member who could read the
 * parent object. Naming the columns is what stops a future column from being
 * exposed by default: a new secret added to `users` does not appear here unless
 * someone puts it here on purpose.
 *
 * Use `PUBLIC_USER_COLUMNS` for `.select()`, and `PUBLIC_USER_WITH` for the
 * relational `with:` form.
 */
exports.PUBLIC_USER_COLUMNS = {
    id: db_1.users.id,
    email: db_1.users.email,
    displayName: db_1.users.displayName,
    avatarUrl: db_1.users.avatarUrl,
    bio: db_1.users.bio,
    timezone: db_1.users.timezone,
    role: db_1.users.role,
    lastSeenAt: db_1.users.lastSeenAt,
    presenceStatus: db_1.users.presenceStatus,
};
/**
 * The same allow-list in the shape drizzle's relational queries want:
 * `with: { creator: PUBLIC_USER_WITH }`.
 */
exports.PUBLIC_USER_WITH = {
    columns: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        timezone: true,
        role: true,
        lastSeenAt: true,
        presenceStatus: true,
    },
};
//# sourceMappingURL=public-user.js.map