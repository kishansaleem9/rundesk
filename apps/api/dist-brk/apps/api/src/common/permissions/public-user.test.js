"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const public_user_1 = require("./public-user");
(0, node_test_1.describe)('public user projection', () => {
    // Columns that must never reach a client through someone else's payload.
    // A task's creator, a comment's author and a watcher are all other people.
    const SECRET = [
        'passwordHash',
        'failedLoginAttempts',
        'lockedUntil',
        'notificationPreferences',
        'emailVerified',
        'isActive',
    ];
    (0, node_test_1.it)('exposes no secret column', () => {
        for (const key of SECRET) {
            strict_1.default.equal(key in public_user_1.PUBLIC_USER_COLUMNS, false, `${key} is exposed via PUBLIC_USER_COLUMNS`);
            strict_1.default.equal(key in public_user_1.PUBLIC_USER_WITH.columns, false, `${key} is exposed via PUBLIC_USER_WITH`);
        }
    });
    (0, node_test_1.it)('keeps both forms of the allow-list in step', () => {
        // Two shapes exist because drizzle's select() and its relational with()
        // disagree about how columns are named. They must still allow the same set,
        // or a field is public through one read path and absent through the other.
        strict_1.default.deepEqual(Object.keys(public_user_1.PUBLIC_USER_COLUMNS).sort(), Object.keys(public_user_1.PUBLIC_USER_WITH.columns).sort());
    });
    (0, node_test_1.it)('names only columns that exist on the users table', () => {
        // A typo here fails open: drizzle would silently drop the key and the
        // field would go missing from every payload rather than erroring.
        const real = new Set(Object.keys((0, drizzle_orm_1.getTableColumns)(db_1.users)));
        for (const key of Object.keys(public_user_1.PUBLIC_USER_COLUMNS)) {
            strict_1.default.equal(real.has(key), true, `${key} is not a column on users`);
        }
    });
    (0, node_test_1.it)('still carries what the UI renders a person with', () => {
        for (const key of ['id', 'email', 'displayName', 'avatarUrl']) {
            strict_1.default.equal(key in public_user_1.PUBLIC_USER_COLUMNS, true, `${key} is needed to render a person`);
        }
    });
});
//# sourceMappingURL=public-user.test.js.map