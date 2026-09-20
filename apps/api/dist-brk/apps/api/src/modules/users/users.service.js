"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = exports.MAX_AVATAR_BYTES = exports.COLLAPSIBLE_PANELS = exports.DEFAULT_PINNED = exports.TOPBAR_ITEMS = exports.WEEK_START_VALUES = exports.TIME_FORMAT_VALUES = exports.DATE_FORMAT_VALUES = exports.THEME_VALUES = exports.SUPPORTED_LOCALES = void 0;
const common_1 = require("@nestjs/common");
const feature_flags_1 = require("@rundesk/feature-flags");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const bcrypt = __importStar(require("bcryptjs"));
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const zone_1 = require("../../common/time/zone");
const r2_service_1 = require("../../common/storage/r2.service");
/** Locales the web app ships translations for (Plan §13). */
exports.SUPPORTED_LOCALES = ['en', 'es', 'ar', 'ur'];
/** UI theme preferences (Plan §13.1). 'system' follows the OS setting. */
exports.THEME_VALUES = ['system', 'light', 'dark'];
/** Date / time / week-start display preferences (Plan §1.2). 'system' follows the browser locale. */
exports.DATE_FORMAT_VALUES = ['system', 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD MMM YYYY'];
exports.TIME_FORMAT_VALUES = ['system', '12h', '24h'];
exports.WEEK_START_VALUES = ['sunday', 'monday', 'saturday'];
/**
 * §1.5 / §6 — every top-bar control a member governs.
 *
 * Search and the user menu are deliberately absent: one is the primary way to
 * find anything and the other is how you reach this setting, so hiding either
 * would be a trap. Everything else is the member's call —
 * "yeh option jo hai woh humare members ke paas hona chahiye".
 *
 * §6 [07:55–08:03] — every tool a member can pin to the top bar.
 *
 * She lists what she pins: "yeh task creation ka option hai, yeh timing ka
 * option, yeh document ka, yeh Loom ka, yeh voice recordings ka, yeh
 * whiteboards ka, aur yeh dashboard ka option hai." The first five entries
 * below are the chrome that was already there; the rest are hers.
 *
 * The complaint this answers is [08:29]: "as compared to hum limited de dein
 * ke okay, theek hai, something ke hum ne rakha hai aur woh us ko choose karna
 * parega." A short list we picked is the thing she was objecting to, so adding
 * to this list is how the answer stays answered.
 */
exports.TOPBAR_ITEMS = [
    'notifications', 'theme', 'timer', 'ai', 'create',
    // §6 frame 087_0535 — "Personal Tools": Notepad sits among these, pinnable.
    'notepad',
    'docs', 'clips', 'recordings', 'whiteboards', 'dashboards',
];
/**
 * What a member who has never opened the picker gets.
 *
 * Deliberately small. The point of pinning is that the bar holds what *you*
 * reach for, and a bar preloaded with ten icons has made the choice for you
 * again — just with a longer list.
 */
exports.DEFAULT_PINNED = ['create', 'timer', 'theme'];
/**
 * §1.3 [10:13] — the surfaces whose SECOND-level panel can be collapsed.
 *
 * "yeh DOUBLE NAVIGATION rakhi hui hai… kyunke yeh SPACE leta hai." Chat's
 * channel list and Docs' tree are the two columns that stack against the
 * workspace sidebar and make her point.
 *
 * A whitelist rather than "whatever the client sends", for the same reason
 * TOPBAR_ITEMS is one: `panels_collapsed` is jsonb, and an unchecked object
 * from a request body is a place to park arbitrary data on a user's row.
 */
exports.COLLAPSIBLE_PANELS = ['chat', 'docs'];
/** Image content types accepted for avatar uploads, mapped to a file extension. */
const AVATAR_CONTENT_TYPES = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
};
/** Hard cap on an uploaded avatar image (Plan §1.2). */
exports.MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
let UsersService = class UsersService {
    constructor(db, r2) {
        this.db = db;
        this.r2 = r2;
    }
    async findById(id) {
        const [user] = await this.db.select().from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.id, id));
        return user ?? null;
    }
    async findByEmail(email) {
        const [user] = await this.db.select().from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.email, email));
        return user ?? null;
    }
    async create(data) {
        const [user] = await this.db.insert(db_1.users).values(data).returning();
        return user;
    }
    async updateProfile(userId, patch) {
        if (patch.locale !== undefined && !exports.SUPPORTED_LOCALES.includes(patch.locale)) {
            throw new common_1.BadRequestException(`Unsupported locale: ${patch.locale}`);
        }
        if (patch.theme !== undefined && !exports.THEME_VALUES.includes(patch.theme)) {
            throw new common_1.BadRequestException(`Unsupported theme: ${patch.theme}`);
        }
        if (patch.dateFormat !== undefined && !exports.DATE_FORMAT_VALUES.includes(patch.dateFormat)) {
            throw new common_1.BadRequestException(`Unsupported date format: ${patch.dateFormat}`);
        }
        if (patch.timeFormat !== undefined && !exports.TIME_FORMAT_VALUES.includes(patch.timeFormat)) {
            throw new common_1.BadRequestException(`Unsupported time format: ${patch.timeFormat}`);
        }
        if (patch.weekStart !== undefined && !exports.WEEK_START_VALUES.includes(patch.weekStart)) {
            throw new common_1.BadRequestException(`Unsupported week start: ${patch.weekStart}`);
        }
        if (patch.topbarHidden !== undefined) {
            // Validate every entry rather than storing what arrived: this is a jsonb
            // column, so an unvalidated array is a place to park arbitrary data on
            // another user's row via a field the client controls.
            if (!Array.isArray(patch.topbarHidden)) {
                throw new common_1.BadRequestException('topbarHidden must be an array');
            }
            const unknown = patch.topbarHidden.filter((item) => !exports.TOPBAR_ITEMS.includes(item));
            if (unknown.length > 0) {
                throw new common_1.BadRequestException(`Unknown top bar item(s): ${unknown.join(', ')}`);
            }
            // De-duplicate so the stored value is a set, not a log of clicks.
            patch.topbarHidden = [...new Set(patch.topbarHidden)];
        }
        if (patch.topbarPinned !== undefined) {
            // Same reasoning as topbarHidden above: a jsonb column fed straight from
            // the client is a place to park arbitrary data on a user row unless every
            // entry is checked against the catalogue.
            if (!Array.isArray(patch.topbarPinned)) {
                throw new common_1.BadRequestException('topbarPinned must be an array');
            }
            const unknown = patch.topbarPinned.filter((item) => !exports.TOPBAR_ITEMS.includes(item));
            if (unknown.length > 0) {
                throw new common_1.BadRequestException(`Unknown top bar item(s): ${unknown.join(', ')}`);
            }
            patch.topbarPinned = [...new Set(patch.topbarPinned)];
        }
        /*
         * A named palette, not a hex field.
         *
         * Her frame shows ClickUp's Themes tab as ten named colours, and that is
         * the right shape for two reasons beyond fidelity: an arbitrary hex can be
         * unreadable against either theme, and a fixed set is the only version of
         * this that can be checked. null clears the choice back to the workspace's.
         */
        if (patch.accentColor !== undefined &&
            patch.accentColor !== null &&
            !feature_flags_1.ACCENT_PALETTE.includes(patch.accentColor)) {
            throw new common_1.BadRequestException(`accentColor must be null or one of: ${feature_flags_1.ACCENT_PALETTE.join(', ')}`);
        }
        if (patch.highContrast !== undefined && typeof patch.highContrast !== 'boolean') {
            throw new common_1.BadRequestException('highContrast must be a boolean');
        }
        if (patch.sidebarCollapsed !== undefined && typeof patch.sidebarCollapsed !== 'boolean') {
            // A jsonb column would swallow anything; this one is a boolean and should
            // say so rather than storing whatever arrived.
            throw new common_1.BadRequestException('sidebarCollapsed must be a boolean');
        }
        if (patch.panelsCollapsed !== undefined) {
            /*
             * §1.3 [10:13] — same reasoning as topbarHidden two blocks up.
             *
             * This IS a jsonb column fed straight from the client, so an unvalidated
             * object is a place to park arbitrary data on a user row. Keys are
             * checked against the surfaces that have a panel, and values must be
             * booleans — an object rebuilt from the whitelist rather than the one
             * that arrived, so nothing rides along in it.
             */
            const value = patch.panelsCollapsed;
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                throw new common_1.BadRequestException('panelsCollapsed must be an object');
            }
            const unknown = Object.keys(value).filter((k) => !exports.COLLAPSIBLE_PANELS.includes(k));
            if (unknown.length > 0) {
                throw new common_1.BadRequestException(`Unknown panel(s): ${unknown.join(', ')}`);
            }
            const clean = {};
            for (const key of exports.COLLAPSIBLE_PANELS) {
                if (value[key] !== undefined) {
                    if (typeof value[key] !== 'boolean') {
                        throw new common_1.BadRequestException(`panelsCollapsed.${key} must be a boolean`);
                    }
                    clean[key] = value[key];
                }
            }
            patch.panelsCollapsed = clean;
        }
        // SECURITY: whitelist the self-editable profile columns. Spreading the raw
        // body let a caller mass-assign any users column — most critically `role`,
        // so `PATCH /users/me {role:"super_admin"}` escalated a member to platform
        // super-admin. Only copy the fields a user is allowed to change themselves.
        /*
         * G06-6 [07:03] — refuse a timezone this system cannot read.
         *
         * `startOfDayIn` falls back to UTC on anything unrecognised so that one bad
         * row cannot take down a profile page, and the cost of that is silence:
         * somebody who typed "Asia/Karach" would get UTC for every due date,
         * reminder, digest and "today" bucket with nothing saying so. Checked here
         * rather than only in the form, because the form is not the only writer.
         */
        if (patch.timezone !== undefined && !(0, zone_1.isValidTimeZone)(patch.timezone)) {
            throw new common_1.BadRequestException(`"${String(patch.timezone)}" is not a timezone this system recognises`);
        }
        const set = { updatedAt: new Date() };
        for (const key of ['displayName', 'bio', 'timezone', 'avatarUrl', 'locale', 'theme', 'dateFormat', 'timeFormat', 'weekStart', 'topbarHidden', 'topbarPinned', 'sidebarCollapsed', 'panelsCollapsed', 'highContrast', 'timezoneChangeNotice', 'accentColor']) {
            if (patch[key] !== undefined)
                set[key] = patch[key];
        }
        const [row] = await this.db
            .update(db_1.users)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .returning();
        if (!row)
            throw new common_1.BadRequestException('User not found');
        return this.publicProfile(row);
    }
    /**
     * Presign a direct-to-R2 PUT for a user's avatar image (Plan §1.2). Mirrors
     * the clip/attachment presign flow: validate the image type + size, hand back
     * a short-lived upload URL plus the public URL the client stores via
     * PATCH /users/me. Keys live under `avatars/<userId>-<rand>.<ext>`.
     */
    async createAvatarUploadUrl(userId, body) {
        if (!this.r2.configured)
            throw new common_1.BadRequestException('R2 storage is not configured');
        const contentType = (body.contentType || '').toLowerCase();
        const ext = AVATAR_CONTENT_TYPES[contentType];
        if (!ext) {
            throw new common_1.BadRequestException('Only image files (PNG, JPEG, WebP, or GIF) are allowed');
        }
        if (body.sizeBytes != null && Number.isFinite(body.sizeBytes) && body.sizeBytes > exports.MAX_AVATAR_BYTES) {
            const mb = Math.round(exports.MAX_AVATAR_BYTES / (1024 * 1024));
            throw new common_1.BadRequestException(`Avatar image exceeds the ${mb} MB limit`);
        }
        const key = `avatars/${userId}-${(0, node_crypto_1.randomBytes)(8).toString('hex')}.${ext}`;
        const uploadUrl = await this.r2.presignPutObject(key, contentType, { uploadedby: userId });
        // Resolve the browser-facing URL the same way clips/attachments do; with a
        // public R2/CDN domain this is a stable URL suitable for persisting.
        const publicUrl = await this.r2.getObjectUrl(key);
        return { uploadUrl, publicUrl, storageKey: key };
    }
    async changePassword(userId, currentPassword, newPassword) {
        if (newPassword.length < 8)
            throw new common_1.BadRequestException('Password must be at least 8 characters');
        const user = await this.findById(userId);
        if (!user)
            throw new common_1.BadRequestException('User not found');
        if (!user.passwordHash)
            throw new common_1.BadRequestException('Account uses SSO; set a password via reset flow');
        const ok = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!ok)
            throw new common_1.UnauthorizedException('Current password is incorrect');
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await this.db
            .update(db_1.users)
            .set({ passwordHash, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId));
        return { ok: true };
    }
    /**
     * GDPR data portability (Plan §14.6). Assemble a JSON bundle of everything we
     * hold that is personal to THIS user: their profile, their workspace/org
     * memberships, the tasks they authored or are assigned to, their comments, and
     * their time entries. Strictly scoped to the requesting user's own data —
     * secrets (password hash, OAuth tokens) are never included.
     */
    async exportUserData(userId) {
        const user = await this.findById(userId);
        if (!user)
            throw new common_1.BadRequestException('User not found');
        const [workspaceMemberships, orgMemberships, tasksCreated, tasksAssigned, comments, timeEntryRows, connectedAccounts,] = await Promise.all([
            this.db
                .select({
                workspaceId: db_1.workspaces.id,
                name: db_1.workspaces.name,
                slug: db_1.workspaces.slug,
                role: db_1.workspaceMembers.role,
                joinedAt: db_1.workspaceMembers.joinedAt,
            })
                .from(db_1.workspaceMembers)
                .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaces.id, db_1.workspaceMembers.workspaceId))
                .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)),
            this.db
                .select({
                organizationId: db_1.organizations.id,
                name: db_1.organizations.name,
                slug: db_1.organizations.slug,
                role: db_1.organizationMembers.role,
                joinedAt: db_1.organizationMembers.joinedAt,
            })
                .from(db_1.organizationMembers)
                .innerJoin(db_1.organizations, (0, drizzle_orm_1.eq)(db_1.organizations.id, db_1.organizationMembers.organizationId))
                .where((0, drizzle_orm_1.eq)(db_1.organizationMembers.userId, userId)),
            this.db
                .select({ id: db_1.tasks.id, title: db_1.tasks.title, status: db_1.tasks.status, createdAt: db_1.tasks.createdAt })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.createdById, userId))
                .orderBy((0, drizzle_orm_1.desc)(db_1.tasks.createdAt))
                .limit(5000),
            this.db
                .select({ taskId: db_1.tasks.id, title: db_1.tasks.title, assignedAt: db_1.taskAssignees.assignedAt })
                .from(db_1.taskAssignees)
                .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
                .where((0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, userId))
                .orderBy((0, drizzle_orm_1.desc)(db_1.taskAssignees.assignedAt))
                .limit(5000),
            this.db
                .select({ id: db_1.taskComments.id, taskId: db_1.taskComments.taskId, body: db_1.taskComments.body, createdAt: db_1.taskComments.createdAt })
                .from(db_1.taskComments)
                .where((0, drizzle_orm_1.eq)(db_1.taskComments.authorId, userId))
                .orderBy((0, drizzle_orm_1.desc)(db_1.taskComments.createdAt))
                .limit(5000),
            this.db
                .select({
                id: db_1.timeEntries.id,
                taskId: db_1.timeEntries.taskId,
                startedAt: db_1.timeEntries.startedAt,
                endedAt: db_1.timeEntries.endedAt,
                durationSec: db_1.timeEntries.durationSec,
                description: db_1.timeEntries.description,
                isBillable: db_1.timeEntries.isBillable,
            })
                .from(db_1.timeEntries)
                .where((0, drizzle_orm_1.eq)(db_1.timeEntries.userId, userId))
                .orderBy((0, drizzle_orm_1.desc)(db_1.timeEntries.startedAt))
                .limit(5000),
            this.db
                .select({ provider: db_1.oauthAccounts.provider, connectedAt: db_1.oauthAccounts.createdAt })
                .from(db_1.oauthAccounts)
                .where((0, drizzle_orm_1.eq)(db_1.oauthAccounts.userId, userId)),
        ]);
        return {
            format: 'rundesk.gdpr.export.v1',
            exportedAt: new Date().toISOString(),
            profile: this.publicProfile(user),
            memberships: { workspaces: workspaceMemberships, organizations: orgMemberships },
            tasks: { created: tasksCreated, assigned: tasksAssigned },
            comments,
            timeEntries: timeEntryRows,
            connectedAccounts,
            counts: {
                workspaces: workspaceMemberships.length,
                organizations: orgMemberships.length,
                tasksCreated: tasksCreated.length,
                tasksAssigned: tasksAssigned.length,
                comments: comments.length,
                timeEntries: timeEntryRows.length,
            },
        };
    }
    /**
     * GDPR right to erasure (Plan §14.6). Irreversibly anonymizes the account:
     * scrubs all PII from the users row, deletes sessions (revokes access), OAuth
     * links, task assignments and every workspace/org membership. Authored content
     * (tasks, comments, time entries) is retained but de-identified — the FKs point
     * at a scrubbed, de-membered row, preserving workspace integrity without
     * keeping the person identifiable.
     *
     * Safety guards (never orphan an org/workspace):
     *   - Requires typing the exact account email to confirm.
     *   - Refuses to delete the last active super admin.
     *   - Refuses to delete the last admin of any workspace (transfer admin first).
     */
    async deleteAccount(userId, confirmation) {
        const user = await this.findById(userId);
        if (!user)
            throw new common_1.BadRequestException('User not found');
        // 1. Confirmation — the caller must retype their exact account email.
        const typed = (confirmation?.confirmEmail ?? '').trim().toLowerCase();
        if (!typed || typed !== user.email.toLowerCase()) {
            throw new common_1.BadRequestException('Type your account email exactly to confirm account deletion');
        }
        // 2. Never delete the last active super admin.
        if (user.role === 'super_admin') {
            const [{ c }] = await this.db
                .select({ c: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(db_1.users)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.users.role, 'super_admin'), (0, drizzle_orm_1.eq)(db_1.users.isActive, true)));
            if (c <= 1) {
                throw new common_1.BadRequestException('Cannot delete the last active super admin. Grant super admin to another account first.');
            }
        }
        // 3. Never delete the last admin of a workspace — would orphan it.
        const adminOf = await this.db
            .select({ workspaceId: db_1.workspaceMembers.workspaceId, name: db_1.workspaces.name })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaces.id, db_1.workspaceMembers.workspaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.role, 'workspace_admin')));
        for (const ws of adminOf) {
            const [{ c }] = await this.db
                .select({ c: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(db_1.workspaceMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, ws.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.role, 'workspace_admin')));
            if (c <= 1) {
                throw new common_1.BadRequestException(`You are the last admin of "${ws.name}". Transfer workspace admin to another member before deleting your account.`);
            }
        }
        // 4. Irreversibly anonymize + revoke, atomically. The anonymized email is
        //    keyed by the user id so it stays unique even across many deletions.
        const anonEmail = `deleted+${userId}@deleted.rundesk.local`;
        await this.db.transaction(async (tx) => {
            await tx.delete(db_1.sessions).where((0, drizzle_orm_1.eq)(db_1.sessions.userId, userId));
            await tx.delete(db_1.oauthAccounts).where((0, drizzle_orm_1.eq)(db_1.oauthAccounts.userId, userId));
            await tx.delete(db_1.taskAssignees).where((0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, userId));
            await tx.delete(db_1.workspaceMembers).where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId));
            await tx.delete(db_1.organizationMembers).where((0, drizzle_orm_1.eq)(db_1.organizationMembers.userId, userId));
            await tx
                .update(db_1.users)
                .set({
                email: anonEmail,
                displayName: 'Deleted User',
                bio: null,
                avatarUrl: null,
                passwordHash: null,
                timezone: 'UTC',
                locale: 'en',
                theme: 'system',
                isActive: false,
                emailVerified: false,
                lastSeenAt: null,
                failedLoginAttempts: 0,
                lockedUntil: null,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(db_1.users.id, userId));
        });
        return { ok: true, anonymized: true, userId };
    }
    publicProfile(user) {
        const { passwordHash, ...rest } = user;
        void passwordHash;
        return rest;
    }
    /**
     * §6 frame `087_0535` — the Notepad from Personal Tools.
     *
     * Read returns '' rather than 404 for somebody who has never written in it:
     * an empty scratch pad and a missing one are the same thing to a person, and
     * a 404 here would make the panel render an error on first open.
     */
    async getNotepad(userId) {
        const [row] = await this.db
            .select({ content: db_1.userNotepads.content, updatedAt: db_1.userNotepads.updatedAt })
            .from(db_1.userNotepads)
            .where((0, drizzle_orm_1.eq)(db_1.userNotepads.userId, userId))
            .limit(1);
        return { content: row?.content ?? '', updatedAt: row?.updatedAt ?? null };
    }
    async saveNotepad(userId, content) {
        if (typeof content !== 'string')
            throw new common_1.BadRequestException('content must be a string');
        // Bounded so a paste of something enormous cannot become a row nobody can
        // load. Generous enough that no real note hits it.
        const trimmed = content.slice(0, 100_000);
        const [row] = await this.db
            .insert(db_1.userNotepads)
            .values({ userId, content: trimmed, updatedAt: new Date() })
            .onConflictDoUpdate({
            target: db_1.userNotepads.userId,
            set: { content: trimmed, updatedAt: new Date() },
        })
            .returning({ content: db_1.userNotepads.content, updatedAt: db_1.userNotepads.updatedAt });
        return { content: row.content, updatedAt: row.updatedAt };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, r2_service_1.R2Service])
], UsersService);
//# sourceMappingURL=users.service.js.map