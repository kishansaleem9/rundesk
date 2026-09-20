"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const bcryptjs_1 = require("bcryptjs");
const auth_service_1 = require("./auth.service");
function makeService(overrides = {}) {
    const security = overrides.security ?? {
        getTotpStatus: node_test_1.mock.fn(async () => ({ enabled: false })),
        validateTotp: node_test_1.mock.fn(async () => true),
    };
    const usersService = overrides.usersService ?? { findByEmail: node_test_1.mock.fn(async () => null) };
    const securitySettings = overrides.securitySettings ?? {
        getEffectiveForUser: node_test_1.mock.fn(async () => ({
            settings: { lockoutEnabled: true, lockoutThreshold: 5, lockoutDurationMinutes: 30 },
        })),
    };
    const setCalls = [];
    const db = overrides.db ?? {
        update: () => ({
            set: (v) => {
                setCalls.push(v);
                return { where: async () => undefined };
            },
        }),
    };
    const svc = new auth_service_1.AuthService(db, usersService, {}, // workspacesService
    {}, // jwtService
    {}, // config
    {}, // featureFlagsService
    {}, // emailService
    security, securitySettings);
    return { svc, security, usersService, securitySettings, db, setCalls };
}
(0, node_test_1.describe)('AuthService.assertTotpSatisfied (2FA at login)', () => {
    (0, node_test_1.it)('is a no-op when the account has no verified TOTP secret (flow unchanged)', async () => {
        const security = {
            getTotpStatus: node_test_1.mock.fn(async () => ({ enabled: false })),
            validateTotp: node_test_1.mock.fn(async () => true),
        };
        const { svc } = makeService({ security });
        await strict_1.default.doesNotReject(() => svc.assertTotpSatisfied('user-1', undefined));
        // The account isn't 2FA-enabled, so we never even attempt to validate a code.
        strict_1.default.equal(security.validateTotp.mock.callCount(), 0);
    });
    (0, node_test_1.it)('rejects with 401 { error: totp_required } when enabled and no code supplied', async () => {
        const security = {
            getTotpStatus: node_test_1.mock.fn(async () => ({ enabled: true })),
            validateTotp: node_test_1.mock.fn(async () => true),
        };
        const { svc } = makeService({ security });
        await strict_1.default.rejects(() => svc.assertTotpSatisfied('user-1', undefined), (err) => {
            strict_1.default.ok(err instanceof common_1.UnauthorizedException);
            strict_1.default.equal(err.getStatus(), 401);
            strict_1.default.equal(err.getResponse().error, 'totp_required');
            return true;
        });
        // Must NOT issue/verify anything — the code is simply absent.
        strict_1.default.equal(security.validateTotp.mock.callCount(), 0);
    });
    (0, node_test_1.it)('treats an empty-string code as missing (totp_required)', async () => {
        const security = {
            getTotpStatus: node_test_1.mock.fn(async () => ({ enabled: true })),
            validateTotp: node_test_1.mock.fn(async () => true),
        };
        const { svc } = makeService({ security });
        await strict_1.default.rejects(() => svc.assertTotpSatisfied('user-1', ''), (err) => {
            strict_1.default.equal(err.getResponse().error, 'totp_required');
            return true;
        });
        strict_1.default.equal(security.validateTotp.mock.callCount(), 0);
    });
    (0, node_test_1.it)('rejects an invalid code with 401 { error: totp_invalid }', async () => {
        const security = {
            getTotpStatus: node_test_1.mock.fn(async () => ({ enabled: true })),
            validateTotp: node_test_1.mock.fn(async () => false),
        };
        const { svc } = makeService({ security });
        await strict_1.default.rejects(() => svc.assertTotpSatisfied('user-1', '000000'), (err) => {
            strict_1.default.ok(err instanceof common_1.UnauthorizedException);
            strict_1.default.equal(err.getResponse().error, 'totp_invalid');
            return true;
        });
        strict_1.default.equal(security.validateTotp.mock.callCount(), 1);
    });
    (0, node_test_1.it)('succeeds with a valid code (delegates to security.validateTotp)', async () => {
        const security = {
            getTotpStatus: node_test_1.mock.fn(async () => ({ enabled: true })),
            validateTotp: node_test_1.mock.fn(async () => true),
        };
        const { svc } = makeService({ security });
        await strict_1.default.doesNotReject(() => svc.assertTotpSatisfied('user-1', '123456'));
        strict_1.default.equal(security.validateTotp.mock.callCount(), 1);
        strict_1.default.deepEqual(security.validateTotp.mock.calls[0].arguments, ['user-1', '123456']);
    });
});
(0, node_test_1.describe)('AuthService.validateUser (no lockout enumeration)', () => {
    const settings = {
        getEffectiveForUser: async () => ({
            settings: { lockoutEnabled: true, lockoutThreshold: 5, lockoutDurationMinutes: 30 },
        }),
    };
    (0, node_test_1.it)('returns the generic "Invalid credentials" for a currently-locked account', async () => {
        const user = {
            id: 'u1',
            email: 'a@b.com',
            passwordHash: (0, bcryptjs_1.hashSync)('correct-horse', 4),
            failedLoginAttempts: 0,
            lockedUntil: new Date(Date.now() + 60 * 60 * 1000), // locked for another hour
            isActive: true,
        };
        const { svc } = makeService({
            usersService: { findByEmail: async () => user },
            securitySettings: settings,
        });
        await strict_1.default.rejects(
        // even the CORRECT password must not reveal the lockout state
        () => svc.validateUser('a@b.com', 'correct-horse'), (err) => {
            strict_1.default.ok(err instanceof common_1.UnauthorizedException);
            strict_1.default.equal(err.message, 'Invalid credentials');
            strict_1.default.doesNotMatch(err.message, /lock/i);
            return true;
        });
    });
    (0, node_test_1.it)('still locks the account server-side on the threshold attempt, but stays generic', async () => {
        const user = {
            id: 'u1',
            email: 'a@b.com',
            passwordHash: (0, bcryptjs_1.hashSync)('correct-horse', 4),
            failedLoginAttempts: 4, // this failed attempt is the 5th → threshold reached
            lockedUntil: null,
            isActive: true,
        };
        const { svc, setCalls } = makeService({
            usersService: { findByEmail: async () => user },
            securitySettings: settings,
        });
        await strict_1.default.rejects(() => svc.validateUser('a@b.com', 'wrong-password'), (err) => {
            strict_1.default.equal(err.message, 'Invalid credentials');
            strict_1.default.doesNotMatch(err.message, /lock|attempt/i);
            return true;
        });
        // Enforcement is preserved: a lockedUntil was written even though the client
        // was told nothing about it.
        strict_1.default.equal(setCalls.length, 1);
        strict_1.default.ok(setCalls[0].lockedUntil instanceof Date);
    });
    (0, node_test_1.it)('increments failed attempts (below threshold) and returns the generic message', async () => {
        const user = {
            id: 'u1',
            email: 'a@b.com',
            passwordHash: (0, bcryptjs_1.hashSync)('correct-horse', 4),
            failedLoginAttempts: 0,
            lockedUntil: null,
            isActive: true,
        };
        const { svc, setCalls } = makeService({
            usersService: { findByEmail: async () => user },
            securitySettings: settings,
        });
        await strict_1.default.rejects(() => svc.validateUser('a@b.com', 'wrong-password'), (err) => {
            strict_1.default.equal(err.message, 'Invalid credentials');
            return true;
        });
        strict_1.default.equal(setCalls.length, 1);
        strict_1.default.equal(setCalls[0].failedLoginAttempts, 1);
        strict_1.default.equal(setCalls[0].lockedUntil, undefined);
    });
});
// ---------------------------------------------------------------------------
// Refresh-token hashing at rest (sessions.refreshToken stores a SHA-256 hash,
// never the raw JWT). These tests exercise the issue/rotation storage, the
// hash-based lookup in refresh/logout, the legacy raw-token migration fallback,
// and the isCurrent/keep-current comparisons that also hash the presented token.
// ---------------------------------------------------------------------------
/** Extract { column, value } from a single drizzle `eq(column, value)` condition. */
function readEq(cond) {
    let column;
    let value;
    for (const chunk of cond?.queryChunks ?? []) {
        const kind = chunk?.constructor?.name;
        if (kind === 'Param')
            value = chunk.value;
        else if (typeof chunk?.name === 'string' && column === undefined)
            column = chunk.name;
    }
    return { column, value };
}
/**
 * Chainable drizzle stand-in that returns queued select rows in order and
 * records every insert, update, and the value each `.where(eq(...))` matches on
 * — enough to assert WHICH value a lookup keyed on (hash vs raw).
 */
function recordingDb(selectResults = []) {
    const queue = [...selectResults];
    const selectWheres = [];
    const inserts = [];
    const updates = [];
    const db = {
        select: () => {
            const rows = queue.shift() ?? [];
            const node = Promise.resolve(rows);
            node.from = () => node;
            node.innerJoin = () => node;
            node.orderBy = () => node;
            node.limit = () => node;
            node.where = (cond) => {
                selectWheres.push(readEq(cond));
                return node;
            };
            return node;
        },
        insert: () => ({
            values: (values) => {
                inserts.push(values);
                const node = Promise.resolve([{ id: 'sess-new', ...values }]);
                node.returning = () => Promise.resolve([{ id: 'sess-new', ...values }]);
                return node;
            },
        }),
        update: () => ({
            set: (set) => ({
                where: (cond) => {
                    updates.push({ set, where: readEq(cond) });
                    return Promise.resolve(undefined);
                },
            }),
        }),
    };
    return { db, selectWheres, inserts, updates };
}
function makeAuthService(over = {}) {
    return new auth_service_1.AuthService((over.db ?? {}), (over.usersService ?? {}), (over.workspacesService ?? {}), (over.jwtService ?? {}), (over.config ?? {}), (over.featureFlagsService ?? {}), {}, // emailService (unused by these paths)
    (over.security ?? {}), (over.securitySettings ?? {}));
}
(0, node_test_1.describe)('hashRefreshToken (refresh-token hashing at rest)', () => {
    (0, node_test_1.it)('is the SHA-256 hex digest of the token, never the token itself', () => {
        const raw = 'header.payload.signature';
        strict_1.default.equal((0, auth_service_1.hashRefreshToken)(raw), (0, node_crypto_1.createHash)('sha256').update(raw).digest('hex'));
        strict_1.default.notEqual((0, auth_service_1.hashRefreshToken)(raw), raw);
        strict_1.default.match((0, auth_service_1.hashRefreshToken)(raw), /^[0-9a-f]{64}$/);
    });
    (0, node_test_1.it)('is deterministic and distinct per token', () => {
        strict_1.default.equal((0, auth_service_1.hashRefreshToken)('a'), (0, auth_service_1.hashRefreshToken)('a'));
        strict_1.default.notEqual((0, auth_service_1.hashRefreshToken)('a'), (0, auth_service_1.hashRefreshToken)('b'));
    });
});
(0, node_test_1.describe)('AuthService.login — refresh token stored hashed', () => {
    (0, node_test_1.it)('persists the SHA-256 hash but hands the raw token back to the client', async () => {
        const { db, inserts } = recordingDb([[]]); // org-memberships lookup → none
        const svc = makeAuthService({
            db,
            workspacesService: { findByMember: async () => [] },
            securitySettings: {
                get: async () => ({
                    sessionTimeoutMinutes: 60,
                    maxConcurrentSessions: 0,
                    ipAllowlistEnabled: false,
                    ipAllowlist: [],
                    ipAllowlistIncludeAdmins: false,
                }),
            },
            featureFlagsService: { resolveForUser: async () => ({ flags: {} }) },
            jwtService: { sign: (payload) => (payload?.type === 'refresh' ? 'RAW-REFRESH-JWT' : 'ACCESS-JWT') },
            config: { getOrThrow: () => 'refresh-secret' },
            security: { logAuditEvent: async () => undefined },
        });
        const bundle = await svc.login({ id: 'u1', email: 'a@b.com', role: 'member', passwordHash: 'x' });
        strict_1.default.equal(inserts.length, 1);
        // Stored value is the hash — never the raw JWT.
        strict_1.default.equal(inserts[0].refreshToken, (0, auth_service_1.hashRefreshToken)('RAW-REFRESH-JWT'));
        strict_1.default.notEqual(inserts[0].refreshToken, 'RAW-REFRESH-JWT');
        // The raw token is still returned to the caller (cookie/body).
        strict_1.default.equal(bundle.refreshToken, 'RAW-REFRESH-JWT');
    });
});
(0, node_test_1.describe)('AuthService.refresh — locate session by hash', () => {
    (0, node_test_1.it)('looks the session up by the token hash, then rotates (revoke + re-issue)', async () => {
        const raw = 'RAW-REFRESH';
        const stored = {
            id: 's1',
            refreshToken: (0, auth_service_1.hashRefreshToken)(raw),
            isRevoked: false,
            expiresAt: new Date(Date.now() + 60_000),
        };
        const { db, selectWheres, updates } = recordingDb([[stored]]);
        const svc = makeAuthService({
            db,
            jwtService: { verify: () => ({ sub: 'u1', type: 'refresh' }) },
            usersService: { findById: async () => ({ id: 'u1', email: 'a@b.com', role: 'member' }) },
            config: { getOrThrow: () => 'refresh-secret' },
        });
        const login = node_test_1.mock.fn(async () => ({ accessToken: 'a', refreshToken: 'NEW', user: {}, workspaces: [], organizations: [] }));
        svc.login = login;
        await svc.refresh(raw);
        // The first lookup keys on the HASH of the presented token, not the raw value.
        strict_1.default.equal(selectWheres[0].column, 'refresh_token');
        strict_1.default.equal(selectWheres[0].value, (0, auth_service_1.hashRefreshToken)(raw));
        strict_1.default.notEqual(selectWheres[0].value, raw);
        // The located session is revoked by id (rotation) and a new one issued via login().
        strict_1.default.ok(updates.some((u) => u.set.isRevoked === true && u.where.value === 's1'));
        strict_1.default.equal(login.mock.callCount(), 1);
    });
});
(0, node_test_1.describe)('AuthService.logout — locate session by hash', () => {
    (0, node_test_1.it)('finds the session by token hash and revokes it by id', async () => {
        const raw = 'RAW-REFRESH';
        const stored = {
            id: 's9',
            refreshToken: (0, auth_service_1.hashRefreshToken)(raw),
            isRevoked: false,
            expiresAt: new Date(Date.now() + 60_000),
        };
        const { db, selectWheres, updates } = recordingDb([[stored]]);
        const svc = makeAuthService({ db });
        await svc.logout(raw);
        strict_1.default.equal(selectWheres[0].value, (0, auth_service_1.hashRefreshToken)(raw));
        strict_1.default.ok(updates.some((u) => u.set.isRevoked === true && u.where.column === 'id' && u.where.value === 's9'));
    });
});
(0, node_test_1.describe)('AuthService — legacy plaintext session fallback (migration-in-place)', () => {
    (0, node_test_1.it)('falls back to the raw lookup and upgrades the stored token to its hash', async () => {
        const raw = 'RAW-LEGACY';
        const legacy = {
            id: 's2',
            refreshToken: raw, // stored plaintext (pre-hashing)
            isRevoked: false,
            expiresAt: new Date(Date.now() + 60_000),
        };
        // First (hash) lookup misses; second (raw) lookup hits the old plaintext row.
        const { db, selectWheres, updates } = recordingDb([[], [legacy]]);
        const svc = makeAuthService({
            db,
            jwtService: { verify: () => ({ sub: 'u1' }) },
            usersService: { findById: async () => ({ id: 'u1', email: 'a@b.com', role: 'member' }) },
            config: { getOrThrow: () => 'refresh-secret' },
        });
        svc.login = node_test_1.mock.fn(async () => ({ accessToken: 'a', refreshToken: 'NEW', user: {}, workspaces: [], organizations: [] }));
        await svc.refresh(raw);
        strict_1.default.equal(selectWheres[0].value, (0, auth_service_1.hashRefreshToken)(raw)); // hash lookup (missed)
        strict_1.default.equal(selectWheres[1].value, raw); // raw fallback (hit)
        // The old row's refreshToken is re-stored as the hash (upgraded on first use).
        strict_1.default.ok(updates.some((u) => u.set.refreshToken === (0, auth_service_1.hashRefreshToken)(raw) && u.where.value === 's2'));
    });
});
(0, node_test_1.describe)('AuthService.refresh — unknown token yields no session', () => {
    (0, node_test_1.it)('throws (no rotation) when neither the hash nor the raw lookup finds a session', async () => {
        const { db } = recordingDb([[], []]); // both lookups miss
        const login = node_test_1.mock.fn(async () => ({}));
        const svc = makeAuthService({
            db,
            jwtService: { verify: () => ({ sub: 'u1' }) },
            config: { getOrThrow: () => 'refresh-secret' },
        });
        svc.login = login;
        await strict_1.default.rejects(() => svc.refresh('WRONG'), (err) => {
            strict_1.default.ok(err instanceof common_1.UnauthorizedException);
            strict_1.default.equal(err.message, 'Session expired');
            return true;
        });
        strict_1.default.equal(login.mock.callCount(), 0);
    });
});
(0, node_test_1.describe)('AuthService.listSessions — isCurrent matches by hash', () => {
    (0, node_test_1.it)('marks the row whose stored hash matches the presented raw token, and never leaks the token', async () => {
        const now = Date.now();
        const rows = [
            { id: 's1', userAgent: 'ua1', ipAddress: 'ip1', isRevoked: false, expiresAt: new Date(now + 1000), createdAt: new Date(now), refreshToken: (0, auth_service_1.hashRefreshToken)('CUR') },
            { id: 's2', userAgent: 'ua2', ipAddress: 'ip2', isRevoked: false, expiresAt: new Date(now + 1000), createdAt: new Date(now - 1000), refreshToken: (0, auth_service_1.hashRefreshToken)('OTHER') },
        ];
        const { db } = recordingDb([rows]);
        const svc = makeAuthService({ db });
        const list = await svc.listSessions('u1', 'CUR');
        const s1 = list.find((r) => r.id === 's1');
        const s2 = list.find((r) => r.id === 's2');
        strict_1.default.equal(s1.isCurrent, true);
        strict_1.default.equal(s2.isCurrent, false);
        // The refresh token (hash or otherwise) must never appear in the response.
        strict_1.default.ok(!('refreshToken' in s1));
    });
    (0, node_test_1.it)('still matches a legacy session whose token is stored raw', async () => {
        const now = Date.now();
        const rows = [
            { id: 's1', userAgent: 'ua', ipAddress: 'ip', isRevoked: false, expiresAt: new Date(now + 1000), createdAt: new Date(now), refreshToken: 'CUR' },
        ];
        const { db } = recordingDb([rows]);
        const svc = makeAuthService({ db });
        const list = await svc.listSessions('u1', 'CUR');
        strict_1.default.equal(list[0].isCurrent, true);
    });
});
(0, node_test_1.describe)('AuthService.revokeOtherSessions — keeps the current session by hash', () => {
    (0, node_test_1.it)('revokes every session except the one whose stored hash matches the presented token', async () => {
        const rows = [
            { id: 's1', refreshToken: (0, auth_service_1.hashRefreshToken)('CUR') },
            { id: 's2', refreshToken: (0, auth_service_1.hashRefreshToken)('OTHER') },
            { id: 's3', refreshToken: (0, auth_service_1.hashRefreshToken)('OTHER2') },
        ];
        const { db, updates } = recordingDb([rows]);
        const svc = makeAuthService({ db });
        const res = await svc.revokeOtherSessions('u1', 'CUR');
        strict_1.default.equal(res.revoked, 2);
        // The current session (s1) is preserved; only the others are revoked.
        strict_1.default.ok(updates.every((u) => u.where.value !== 's1'));
        strict_1.default.ok(updates.some((u) => u.where.value === 's2'));
        strict_1.default.ok(updates.some((u) => u.where.value === 's3'));
    });
});
//# sourceMappingURL=auth.service.test.js.map