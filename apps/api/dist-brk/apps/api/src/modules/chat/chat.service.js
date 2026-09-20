"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = exports.MAX_GROUP_DM_MEMBERS = exports.MAX_CUSTOM_EMOJI_BYTES = exports.MAX_CHAT_ATTACHMENT_BYTES = void 0;
exports.computeDeliveryStatus = computeDeliveryStatus;
exports.normalizeSaveTags = normalizeSaveTags;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const r2_service_1 = require("../../common/storage/r2.service");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
const notifications_service_1 = require("../notifications/notifications.service");
const tasks_service_1 = require("../tasks/tasks.service");
const task_reminders_service_1 = require("../reminders/task-reminders.service");
const presence_service_1 = require("../presence/presence.service");
const ai_service_1 = require("../ai/ai.service");
const shares_service_1 = require("../shares/shares.service");
const skills_service_1 = require("../skills/skills.service");
const skill_slug_1 = require("../skills/skill-slug");
const link_unfurl_1 = require("./link-unfurl");
const AI_USER_EMAIL = 'ai-assistant@rundesk.system';
/** Link-preview cache tuning (Plan §6.3). Short TTL so previews stay fresh but
 *  repeated views of the same link don't refetch. */
const UNFURL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const UNFURL_CACHE_MAX_ENTRIES = 500;
/** Hard cap on a single chat attachment (Plan §6.8) — mirrors task attachments. */
exports.MAX_CHAT_ATTACHMENT_BYTES = 100 * 1024 * 1024; // 100 MB
/** Hard cap on an uploaded custom-emoji image (§A3.8) — emoji render at ~20px. */
exports.MAX_CUSTOM_EMOJI_BYTES = 512 * 1024; // 512 KB
/** Max members in a group DM incl. the creator (Plan §6.2). */
exports.MAX_GROUP_DM_MEMBERS = 8;
function computeDeliveryStatus(createdAt, otherMembers) {
    const at = createdAt.getTime();
    let delivered = false;
    for (const m of otherMembers) {
        if (m.lastReadAt && m.lastReadAt.getTime() >= at)
            return 'seen';
        if (m.lastDeliveredAt && m.lastDeliveredAt.getTime() >= at)
            delivered = true;
    }
    return delivered ? 'delivered' : 'sent';
}
/** Normalize user-supplied bookmark tags (Plan §6.7): trim, lowercase, dedupe,
 *  drop empties, cap count + length so the Saved panel stays tidy. */
function normalizeSaveTags(tags) {
    if (!Array.isArray(tags))
        return [];
    const cleaned = tags
        .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
        .filter((t) => t.length > 0 && t.length <= 32);
    return [...new Set(cleaned)].slice(0, 20);
}
let ChatService = class ChatService {
    constructor(db, realtime, notifications, tasks, ai, r2, reminders, presence, shares, skills) {
        this.db = db;
        this.realtime = realtime;
        this.notifications = notifications;
        this.tasks = tasks;
        this.ai = ai;
        this.r2 = r2;
        this.reminders = reminders;
        this.presence = presence;
        this.shares = shares;
        this.skills = skills;
        this.aiUserId = null;
        /** In-memory unfurl cache (Plan §6.3): url → { fetchedAt, metadata }. */
        this.unfurlCache = new Map();
    }
    sanitizeFileName(input) {
        return input.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
    }
    /**
     * §6.8 — enforce the declared attachment size on the presign/record paths.
     * A valid, positive `sizeBytes` is mandatory (reject missing/≤0/over cap). The
     * declared-size gate is authoritative because R2 presigned PUT URLs cannot
     * bound the actual uploaded bytes (see R2Service.presignPutObject).
     */
    assertAttachmentSize(sizeBytes) {
        if (sizeBytes == null || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
            throw new common_1.BadRequestException('A valid attachment sizeBytes is required');
        }
        if (sizeBytes > exports.MAX_CHAT_ATTACHMENT_BYTES) {
            const mb = Math.round(exports.MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024));
            throw new common_1.BadRequestException(`Attachment exceeds the ${mb} MB limit`);
        }
    }
    /**
     * Presign a direct-to-R2 upload for a chat attachment (Plan §6.8). The caller
     * PUTs the bytes to `uploadUrl`, then calls recordAttachment with the returned
     * storageKey. Membership is enforced up-front via assertChannelAccess.
     */
    async createAttachmentUploadUrl(channelId, userId, body) {
        this.assertCanPost(await this.assertChannelAccess(channelId, userId));
        if (!this.r2.configured)
            throw new common_1.BadRequestException('R2 storage is not configured');
        this.assertAttachmentSize(body.sizeBytes);
        const fileName = this.sanitizeFileName(body.fileName);
        const key = `chat/${channelId}/attachments/${Date.now()}-${fileName}`;
        const uploadUrl = await this.r2.presignPutObject(key, body.contentType || 'application/octet-stream', {
            uploadedby: userId,
            channelid: channelId,
        });
        return { uploadUrl, storageKey: key };
    }
    /**
     * Record an uploaded attachment (message_id null until the message is posted).
     * Returns the row plus a short-lived download URL so the composer can preview it.
     */
    async recordAttachment(channelId, userId, data) {
        this.assertCanPost(await this.assertChannelAccess(channelId, userId));
        this.assertAttachmentSize(data.sizeBytes);
        if (!data.storageKey)
            throw new common_1.BadRequestException('storageKey is required');
        const [row] = await this.db
            .insert(db_1.chatMessageAttachments)
            .values({
            channelId,
            fileName: this.sanitizeFileName(data.fileName),
            contentType: data.contentType || 'application/octet-stream',
            sizeBytes: Math.max(0, Math.floor(data.sizeBytes || 0)),
            storageKey: data.storageKey,
            uploadedById: userId,
        })
            .returning();
        return {
            id: row.id,
            fileName: row.fileName,
            contentType: row.contentType,
            sizeBytes: row.sizeBytes,
            storageKey: row.storageKey,
            url: this.r2.configured ? await this.r2.getObjectUrl(row.storageKey) : row.storageKey,
        };
    }
    /** Ensure a system "Rundesk AI" user exists to author @Rundesk replies. */
    async ensureAiUser() {
        if (this.aiUserId)
            return this.aiUserId;
        const [existing] = await this.db.select({ id: db_1.users.id }).from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.email, AI_USER_EMAIL)).limit(1);
        if (existing) {
            this.aiUserId = existing.id;
            return existing.id;
        }
        const [created] = await this.db
            .insert(db_1.users)
            .values({ email: AI_USER_EMAIL, displayName: 'Rundesk AI', emailVerified: true })
            .onConflictDoNothing()
            .returning({ id: db_1.users.id });
        if (created) {
            this.aiUserId = created.id;
            return created.id;
        }
        const [row] = await this.db.select({ id: db_1.users.id }).from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.email, AI_USER_EMAIL)).limit(1);
        this.aiUserId = row.id;
        return row.id;
    }
    /** If a message mentions @Rundesk, generate + post an AI reply (§7.6). */
    async maybeAnswerAiMention(channel, authorId, body) {
        if (!/@rundesk\b/i.test(body) || !this.ai.isAvailable())
            return;
        try {
            const aiUserId = await this.ensureAiUser();
            // Make sure the AI is a member so its message passes access checks.
            await this.db
                .insert(db_1.chatChannelMembers)
                .values({ channelId: channel.id, userId: aiUserId })
                .onConflictDoNothing();
            const context = await this.ai.buildWorkspaceContext(channel.workspaceId, authorId);
            const prompt = body.replace(/@rundesk\b/gi, '').trim() || 'Say hello and offer help.';
            const answer = await this.ai.chatReply([{ role: 'user', content: prompt }], context, {
                userId: authorId,
                workspaceId: channel.workspaceId,
            });
            if (!answer)
                return;
            const [aiMsg] = await this.db
                .insert(db_1.chatMessages)
                .values({ channelId: channel.id, authorId: aiUserId, body: answer })
                .returning();
            this.realtime.emitToWorkspace(channel.workspaceId, {
                type: 'chat.message.created',
                workspaceId: channel.workspaceId,
                channelId: channel.id,
                message: { ...aiMsg, authorName: 'Rundesk AI', reactions: [] },
            });
        }
        catch {
            // AI reply is best-effort; never break the user's message.
        }
    }
    extractMentionIds(body) {
        const ids = new Set();
        const patterns = [
            /<@([0-9a-fA-F-]{36})>/g,
            /@\[([0-9a-fA-F-]{36})\]/g,
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(body)) !== null)
                ids.add(match[1]);
        }
        return [...ids];
    }
    /**
     * Detect the broadcast mentions @here / @channel (Plan §6.9). `@channel`
     * targets every channel member; `@here` targets only the currently-present
     * members. Word-boundaried + case-insensitive so "@channel," or "@Here" match
     * but an email like "a@channel.com" does not (the trailing `.` isn't allowed).
     */
    extractSpecialMentions(body) {
        return {
            here: /(^|\s)@here\b(?!\.)/i.test(body),
            channel: /(^|\s)@channel\b(?!\.)/i.test(body),
        };
    }
    /**
     * §A4.3 — pull out candidate team handles. Deliberately loose: anything that
     * looks like a handle is collected here and only becomes a mention if a team
     * in this workspace actually answers to it, so `@here` or a stray `@word`
     * costs one lookup and notifies nobody.
     */
    extractAliasCandidates(body) {
        const out = new Set();
        // `<` is excluded so the `<@uuid>` user-mention token is not re-read as a
        // handle, and `/` so an email or URL fragment never is.
        const pattern = /(^|[^\w@/<[])@([a-z0-9][a-z0-9_-]{1,31})\b(?!\.)/gi;
        let match;
        while ((match = pattern.exec(body)) !== null)
            out.add(match[2].toLowerCase());
        return [...out];
    }
    /**
     * Expand @team handles into the member ids they stand for. A team mention is
     * a shorthand for its people: everyone in the group gets the same mention
     * ping they would have got had they been named individually.
     */
    async resolveTeamMentionTargets(workspaceId, body) {
        const targets = new Set();
        const candidates = this.extractAliasCandidates(body);
        if (candidates.length === 0)
            return targets;
        const rows = await this.db
            .select({ userId: db_1.workspaceGroupMembers.userId })
            .from(db_1.workspaceGroups)
            .innerJoin(db_1.workspaceGroupMembers, (0, drizzle_orm_1.eq)(db_1.workspaceGroupMembers.groupId, db_1.workspaceGroups.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceGroups.workspaceId, workspaceId), (0, drizzle_orm_1.isNotNull)(db_1.workspaceGroups.alias), (0, drizzle_orm_1.inArray)((0, drizzle_orm_1.sql) `lower(${db_1.workspaceGroups.alias})`, candidates)));
        for (const row of rows)
            targets.add(row.userId);
        return targets;
    }
    /**
     * Resolve the member ids a @here / @channel broadcast should notify. @channel
     * is every member; @here narrows to members the presence service reports as
     * online, falling back to all members if presence is unavailable or nobody
     * registers as present. Excludes the author.
     */
    async resolveBroadcastTargets(channelId, authorId, special, memberIds) {
        const targets = new Set();
        if (!special.here && !special.channel)
            return targets;
        const others = memberIds.filter((id) => id !== authorId);
        if (special.channel) {
            for (const id of others)
                targets.add(id);
            return targets;
        }
        // @here only: narrow to present members via the presence service.
        try {
            const statuses = await this.presence.statusFor(others);
            const present = others.filter((id) => statuses[id] === 'online');
            // If presence has no signal for anyone (e.g. never-seen), treat @here like
            // @channel so the broadcast isn't silently dropped.
            const chosen = present.length > 0 ? present : others;
            for (const id of chosen)
                targets.add(id);
        }
        catch {
            for (const id of others)
                targets.add(id);
        }
        return targets;
    }
    async assertChannelAccess(channelId, userId) {
        const [channel] = await this.db.select().from(db_1.chatChannels).where((0, drizzle_orm_1.eq)(db_1.chatChannels.id, channelId)).limit(1);
        if (!channel)
            throw new common_1.NotFoundException('Channel not found');
        const [membership] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, channel.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!membership)
            throw new common_1.ForbiddenException('Workspace membership required');
        // Space-scoped channels (Plan §6.1): a channel in a PRIVATE space also
        // requires space membership. Public spaces (the default) fall back to plain
        // workspace membership — mirrors the container-access model used elsewhere.
        if (channel.spaceId) {
            const [space] = await this.db
                .select({ visibility: db_1.spaces.visibility })
                .from(db_1.spaces)
                .where((0, drizzle_orm_1.eq)(db_1.spaces.id, channel.spaceId))
                .limit(1);
            if (space?.visibility === 'private') {
                const [spaceMembership] = await this.db
                    .select({ userId: db_1.spaceMembers.userId })
                    .from(db_1.spaceMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, channel.spaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, userId)))
                    .limit(1);
                if (!spaceMembership)
                    throw new common_1.ForbiddenException('Space membership required');
            }
        }
        // Share & Permissions can also let someone into a private channel. Only a
        // grant on the CHANNEL counts — inheriting a space grant here would open
        // every private channel in that space to anyone who can see the space.
        // A DM is never shareable, so a grant can never stand in for membership.
        const sharedLevel = channel.isDm
            ? null
            : await this.shares.directLevel('channel', channelId, userId);
        let isMember = true;
        if (channel.isPrivate || channel.isDm) {
            const [channelMembership] = await this.db
                .select({ userId: db_1.chatChannelMembers.userId })
                .from(db_1.chatChannelMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, channelId), (0, drizzle_orm_1.eq)(db_1.chatChannelMembers.userId, userId)))
                .limit(1);
            if (!channelMembership && !sharedLevel)
                throw new common_1.ForbiddenException('Channel membership required');
            isMember = !!channelMembership;
        }
        // The grant wins over membership, deliberately. Opening a channel upserts a
        // member row (markChannelRead), so letting membership win would quietly
        // promote a view-only visitor to full posting rights on their second
        // request. Most-specific-wins keeps the granted level authoritative.
        return { ...channel, accessLevel: sharedLevel ?? 'admin', isMember };
    }
    /** Read-only visitors (view level) may not write into a channel. */
    assertCanPost(access) {
        if (access.accessLevel === 'view') {
            throw new common_1.ForbiddenException('You have view-only access to this channel');
        }
    }
    /**
     * Someone inside a private channel purely because it was shared with them.
     *
     * They must never acquire a chat_channel_members row: membership outlives the
     * grant, so revoking the share would leave them with access anyway. Their
     * read/delivery markers go untracked, which is a fair trade for revocation
     * that actually revokes.
     */
    isShareOnlyVisitor(access) {
        return access.isPrivate && !access.isMember;
    }
    async listChannels(workspaceId, userId) {
        const rows = await this.db
            .select({
            id: db_1.chatChannels.id,
            name: db_1.chatChannels.name,
            description: db_1.chatChannels.description,
            topic: db_1.chatChannels.topic,
            icon: db_1.chatChannels.icon,
            spaceId: db_1.chatChannels.spaceId,
            isPrivate: db_1.chatChannels.isPrivate,
            isDm: db_1.chatChannels.isDm,
            createdById: db_1.chatChannels.createdById,
            createdAt: db_1.chatChannels.createdAt,
        })
            .from(db_1.chatChannels)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.isNull)(db_1.chatChannels.archivedAt)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.chatChannels.createdAt));
        const memberships = await this.db
            .select()
            .from(db_1.chatChannelMembers)
            .where((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.userId, userId));
        const memberSet = new Set(memberships.map((m) => m.channelId));
        const lastReadMap = new Map(memberships.map((m) => [m.channelId, m.lastReadAt]));
        const levelMap = new Map(memberships.map((m) => [m.channelId, m.notificationLevel]));
        // Channels shared with this user directly. Without this a private channel
        // granted through Share & Permissions would stay invisible in the sidebar,
        // leaving the grant unreachable.
        const grants = await this.db
            .select({ channelId: db_1.objectShares.objectId, level: db_1.objectShares.level })
            .from(db_1.objectShares)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.objectShares.objectType, 'channel'), (0, drizzle_orm_1.eq)(db_1.objectShares.userId, userId), (0, drizzle_orm_1.eq)(db_1.objectShares.workspaceId, workspaceId)));
        const grantMap = new Map(grants.map((g) => [g.channelId, g.level]));
        // Unread = top-level messages the user didn't author, newer than their
        // last-read marker, across the channels they're a member of.
        const unreadRows = await this.db
            .select({ channelId: db_1.chatMessages.channelId, count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(db_1.chatMessages)
            .innerJoin(db_1.chatChannelMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, db_1.chatMessages.channelId), (0, drizzle_orm_1.eq)(db_1.chatChannelMembers.userId, userId)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.ne)(db_1.chatMessages.authorId, userId), (0, drizzle_orm_1.isNull)(db_1.chatMessages.parentMessageId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(db_1.chatChannelMembers.lastReadAt), (0, drizzle_orm_1.gt)(db_1.chatMessages.createdAt, db_1.chatChannelMembers.lastReadAt))))
            .groupBy(db_1.chatMessages.channelId);
        const unreadMap = new Map(unreadRows.map((r) => [r.channelId, r.count]));
        const visible = rows
            .filter((c) => !c.isPrivate || memberSet.has(c.id) || grantMap.has(c.id))
            .map((c) => ({
            ...c,
            joined: memberSet.has(c.id),
            unreadCount: unreadMap.get(c.id) ?? 0,
            lastReadAt: lastReadMap.get(c.id) ?? null,
            notificationLevel: levelMap.get(c.id) ?? 'all',
            // Lets the composer go read-only for a view-only visitor.
            accessLevel: grantMap.get(c.id) ?? 'admin',
        }));
        const dmChannels = visible.filter((c) => c.isDm);
        if (dmChannels.length === 0)
            return visible;
        const dmIds = dmChannels.map((c) => c.id);
        const members = await this.db
            .select({
            channelId: db_1.chatChannelMembers.channelId,
            userId: db_1.chatChannelMembers.userId,
            displayName: db_1.users.displayName,
            avatarUrl: db_1.users.avatarUrl,
        })
            .from(db_1.chatChannelMembers)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatChannelMembers.userId))
            .where((0, drizzle_orm_1.or)(...dmIds.map((id) => (0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, id))));
        return visible.map((channel) => {
            if (!channel.isDm)
                return channel;
            // A DM can have >2 members (group DM, Plan §6.2). Label with every other
            // participant; keep the single dmPeer* fields (first peer) for the 1:1 UI.
            const peers = members.filter((m) => m.channelId === channel.id && m.userId !== userId);
            const primary = peers[0];
            const isGroup = peers.length > 1;
            return {
                ...channel,
                dmPeerId: primary?.userId,
                dmPeerName: primary?.displayName ?? null,
                dmPeerAvatarUrl: primary?.avatarUrl ?? null,
                dmIsGroup: isGroup,
                dmPeers: peers.map((p) => ({ userId: p.userId, displayName: p.displayName ?? null, avatarUrl: p.avatarUrl ?? null })),
                dmLabel: isGroup ? peers.map((p) => p.displayName ?? 'Member').join(', ') : (primary?.displayName ?? null),
            };
        });
    }
    /** Mark a channel read up to now for the user (upserts their member row). */
    async markChannelRead(channelId, userId) {
        const access = await this.assertChannelAccess(channelId, userId);
        const now = new Date();
        if (this.isShareOnlyVisitor(access))
            return { ok: true, lastReadAt: now };
        await this.db
            .insert(db_1.chatChannelMembers)
            .values({ channelId, userId, lastReadAt: now })
            .onConflictDoUpdate({
            target: [db_1.chatChannelMembers.channelId, db_1.chatChannelMembers.userId],
            set: { lastReadAt: now },
        });
        return { ok: true, lastReadAt: now };
    }
    /** Mark the channel's messages delivered to the caller (Plan §6.2). Mirrors
     *  markChannelRead but only advances the delivery marker — the client calls
     *  this when it receives/opens a channel's messages, so senders can see
     *  "Delivered" before the recipient actually reads. */
    async markChannelDelivered(channelId, userId) {
        const access = await this.assertChannelAccess(channelId, userId);
        const now = new Date();
        if (this.isShareOnlyVisitor(access))
            return { ok: true, lastDeliveredAt: now };
        await this.db
            .insert(db_1.chatChannelMembers)
            .values({ channelId, userId, lastDeliveredAt: now })
            .onConflictDoUpdate({
            target: [db_1.chatChannelMembers.channelId, db_1.chatChannelMembers.userId],
            set: { lastDeliveredAt: now },
        });
        return { ok: true, lastDeliveredAt: now };
    }
    /**
     * Rewind the caller's read cursor so a channel comes back unread (§A3.3).
     * With a messageId the cursor lands 1ms before that message, so the stream's
     * unread divider sits exactly above it; without one it lands before the most
     * recent message someone else wrote, which is what "mark this channel unread"
     * means from the sidebar.
     */
    async markChannelUnread(channelId, userId, messageId) {
        const access = await this.assertChannelAccess(channelId, userId);
        let anchor = null;
        if (messageId) {
            const [message] = await this.db
                .select({ createdAt: db_1.chatMessages.createdAt, channelId: db_1.chatMessages.channelId })
                .from(db_1.chatMessages)
                .where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId))
                .limit(1);
            if (!message || message.channelId !== channelId)
                throw new common_1.NotFoundException('Message not found');
            anchor = message.createdAt;
        }
        else {
            const [latest] = await this.db
                .select({ createdAt: db_1.chatMessages.createdAt })
                .from(db_1.chatMessages)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatMessages.channelId, channelId), (0, drizzle_orm_1.isNull)(db_1.chatMessages.parentMessageId), (0, drizzle_orm_1.ne)(db_1.chatMessages.authorId, userId)))
                .orderBy((0, drizzle_orm_1.desc)(db_1.chatMessages.createdAt))
                .limit(1);
            anchor = latest?.createdAt ?? null;
        }
        // Nothing to go back to (an empty channel, or only the caller's own
        // messages) — clearing the cursor is the honest answer.
        const lastReadAt = anchor ? new Date(anchor.getTime() - 1) : null;
        if (this.isShareOnlyVisitor(access))
            return { ok: true, lastReadAt };
        await this.db
            .insert(db_1.chatChannelMembers)
            .values({ channelId, userId, lastReadAt })
            .onConflictDoUpdate({
            target: [db_1.chatChannelMembers.channelId, db_1.chatChannelMembers.userId],
            set: { lastReadAt },
        });
        return { ok: true, lastReadAt };
    }
    /** Set the caller's notification level for a channel ('all' | 'mentions' | 'none'). */
    async setChannelNotificationLevel(channelId, userId, level) {
        if (!['all', 'mentions', 'none'].includes(level)) {
            throw new common_1.ForbiddenException("level must be 'all', 'mentions', or 'none'");
        }
        const access = await this.assertChannelAccess(channelId, userId);
        if (this.isShareOnlyVisitor(access))
            return { ok: true, notificationLevel: level };
        await this.db
            .insert(db_1.chatChannelMembers)
            .values({ channelId, userId, notificationLevel: level })
            .onConflictDoUpdate({
            target: [db_1.chatChannelMembers.channelId, db_1.chatChannelMembers.userId],
            set: { notificationLevel: level },
        });
        return { ok: true, level };
    }
    /** Total + per-channel unread counts across the user's channels in a workspace. */
    async unreadSummary(workspaceId, userId) {
        const rows = await this.db
            .select({ channelId: db_1.chatMessages.channelId, count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(db_1.chatMessages)
            .innerJoin(db_1.chatChannels, (0, drizzle_orm_1.eq)(db_1.chatChannels.id, db_1.chatMessages.channelId))
            .innerJoin(db_1.chatChannelMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, db_1.chatMessages.channelId), (0, drizzle_orm_1.eq)(db_1.chatChannelMembers.userId, userId)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.isNull)(db_1.chatChannels.archivedAt), (0, drizzle_orm_1.ne)(db_1.chatMessages.authorId, userId), (0, drizzle_orm_1.isNull)(db_1.chatMessages.parentMessageId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(db_1.chatChannelMembers.lastReadAt), (0, drizzle_orm_1.gt)(db_1.chatMessages.createdAt, db_1.chatChannelMembers.lastReadAt))))
            .groupBy(db_1.chatMessages.channelId);
        const byChannel = {};
        let total = 0;
        for (const r of rows) {
            byChannel[r.channelId] = r.count;
            total += r.count;
        }
        return { total, byChannel };
    }
    async ensureDmChannel(workspaceId, currentUserId, peerUserId) {
        if (currentUserId === peerUserId)
            throw new common_1.ForbiddenException('Cannot create a DM with yourself');
        const [meMembership] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, currentUserId)))
            .limit(1);
        const [peerMembership] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, peerUserId)))
            .limit(1);
        if (!meMembership || !peerMembership) {
            throw new common_1.ForbiddenException('Both users must belong to this workspace');
        }
        const dmChannels = await this.db
            .select({ id: db_1.chatChannels.id })
            .from(db_1.chatChannels)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.chatChannels.isDm, true), (0, drizzle_orm_1.isNull)(db_1.chatChannels.archivedAt)));
        for (const channel of dmChannels) {
            const members = await this.db
                .select({ userId: db_1.chatChannelMembers.userId })
                .from(db_1.chatChannelMembers)
                .where((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, channel.id));
            const ids = new Set(members.map((m) => m.userId));
            if (ids.size === 2 && ids.has(currentUserId) && ids.has(peerUserId))
                return channel;
        }
        const [row] = await this.db
            .insert(db_1.chatChannels)
            .values({
            workspaceId,
            name: `dm-${currentUserId.slice(0, 8)}-${peerUserId.slice(0, 8)}`,
            isPrivate: true,
            isDm: true,
            createdById: currentUserId,
        })
            .returning();
        await this.db
            .insert(db_1.chatChannelMembers)
            .values([
            { channelId: row.id, userId: currentUserId },
            { channelId: row.id, userId: peerUserId },
        ])
            .onConflictDoNothing();
        this.realtime.emitToWorkspace(workspaceId, {
            type: 'chat.channel.created',
            workspaceId,
            channel: row,
        });
        return row;
    }
    /**
     * Create (or reuse) a group DM among the current user and 2+ peers (Plan §6.2).
     * A group DM is an isDm channel with 3+ members; dedup is by the exact member
     * set so re-opening the same group returns the existing channel. A single peer
     * falls back to the 1:1 ensureDmChannel path.
     */
    async createGroupDm(workspaceId, currentUserId, peerUserIds) {
        const peers = [...new Set((peerUserIds ?? []).filter(Boolean))].filter((id) => id !== currentUserId);
        if (peers.length === 0)
            throw new common_1.BadRequestException('Select at least one other person for a direct message');
        if (peers.length === 1)
            return this.ensureDmChannel(workspaceId, currentUserId, peers[0]);
        // Cap group size incl. the creator (Plan §6.2).
        if (peers.length + 1 > exports.MAX_GROUP_DM_MEMBERS) {
            throw new common_1.BadRequestException(`A group direct message can include at most ${exports.MAX_GROUP_DM_MEMBERS} people`);
        }
        // Every participant (creator + peers) must belong to the workspace.
        const participants = [currentUserId, ...peers];
        const wsMembers = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.userId, participants)));
        const validIds = new Set(wsMembers.map((m) => m.userId));
        if (!validIds.has(currentUserId))
            throw new common_1.ForbiddenException('Workspace membership required');
        if (participants.some((id) => !validIds.has(id))) {
            throw new common_1.ForbiddenException('All participants must belong to this workspace');
        }
        // Reuse an existing group DM whose member set is exactly these participants.
        const target = new Set(participants);
        const dmChannels = await this.db
            .select({ id: db_1.chatChannels.id })
            .from(db_1.chatChannels)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.chatChannels.isDm, true), (0, drizzle_orm_1.isNull)(db_1.chatChannels.archivedAt)));
        for (const channel of dmChannels) {
            const rows = await this.db
                .select({ userId: db_1.chatChannelMembers.userId })
                .from(db_1.chatChannelMembers)
                .where((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, channel.id));
            const ids = new Set(rows.map((r) => r.userId));
            if (ids.size === target.size && [...target].every((id) => ids.has(id)))
                return channel;
        }
        const [row] = await this.db
            .insert(db_1.chatChannels)
            .values({
            workspaceId,
            name: `dm-group-${currentUserId.slice(0, 8)}-${target.size}`,
            isPrivate: true,
            isDm: true,
            createdById: currentUserId,
        })
            .returning();
        await this.db
            .insert(db_1.chatChannelMembers)
            .values([...target].map((userId) => ({ channelId: row.id, userId })))
            .onConflictDoNothing();
        this.realtime.emitToWorkspace(workspaceId, {
            type: 'chat.channel.created',
            workspaceId,
            channel: row,
        });
        return row;
    }
    async createChannel(data) {
        // A non-string name (missing, number, object) threw on `.trim()` → 500.
        // Validate the type first and return a 400 instead.
        if (typeof data.name !== 'string' || !data.name.trim())
            throw new common_1.BadRequestException('Channel name required');
        const name = data.name.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
        if (!name)
            throw new common_1.BadRequestException('Channel name required');
        // Optional space scoping (Plan §6.1): the space must belong to this workspace.
        let spaceId = null;
        if (data.spaceId) {
            const [space] = await this.db
                .select({ id: db_1.spaces.id })
                .from(db_1.spaces)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.id, data.spaceId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, data.workspaceId)))
                .limit(1);
            if (!space)
                throw new common_1.BadRequestException('Space not found in this workspace');
            spaceId = space.id;
        }
        const [row] = await this.db
            .insert(db_1.chatChannels)
            .values({
            workspaceId: data.workspaceId,
            name,
            description: data.description,
            icon: data.icon,
            spaceId,
            isPrivate: data.isPrivate ?? false,
            createdById: data.createdById,
        })
            .returning();
        await this.db
            .insert(db_1.chatChannelMembers)
            .values({ channelId: row.id, userId: data.createdById })
            .onConflictDoNothing();
        // Seed any invited members (validated against workspace membership).
        if (data.memberIds?.length) {
            await this.addChannelMembers(row.id, data.createdById, data.memberIds);
        }
        this.realtime.emitToWorkspace(data.workspaceId, {
            type: 'chat.channel.created',
            workspaceId: data.workspaceId,
            channel: row,
        });
        return row;
    }
    /**
     * Edit a channel's name / topic / description / icon (Plan §6.1, §A3.7).
     * Moderator-gated (channel creator or workspace admin) via canModerateChannel.
     * DMs aren't editable this way. Only provided fields are changed.
     */
    async updateChannel(channelId, userId, patch) {
        const channel = await this.assertChannelAccess(channelId, userId);
        if (channel.isDm)
            throw new common_1.BadRequestException('Direct messages cannot be edited');
        if (!(await this.canModerateChannel(channel, userId))) {
            throw new common_1.ForbiddenException('Only the channel creator or a workspace admin can edit this channel');
        }
        const set = {};
        if (patch.name !== undefined) {
            const name = patch.name.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
            if (!name)
                throw new common_1.BadRequestException('Channel name required');
            set.name = name;
        }
        if (patch.topic !== undefined)
            set.topic = patch.topic?.trim().slice(0, 250) || null;
        if (patch.description !== undefined)
            set.description = patch.description?.trim() || null;
        if (patch.icon !== undefined)
            set.icon = patch.icon?.trim() || null;
        if (Object.keys(set).length === 0)
            return channel;
        const [row] = await this.db
            .update(db_1.chatChannels)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.chatChannels.id, channelId))
            .returning();
        // Reuse chat.channel.created (the client handler just refetches the channel
        // list) so other members pick up the new name / description / icon.
        this.realtime.emitToWorkspace(channel.workspaceId, {
            type: 'chat.channel.created',
            workspaceId: channel.workspaceId,
            channel: row,
        });
        return row;
    }
    /**
     * Archive / unarchive a channel (Plan §6.1). Writes archivedAt; archived
     * channels drop out of the normal list. Moderator-gated; DMs excluded.
     */
    async setChannelArchived(channelId, userId, archived) {
        const channel = await this.assertChannelAccess(channelId, userId);
        if (channel.isDm)
            throw new common_1.BadRequestException('Direct messages cannot be archived');
        if (!(await this.canModerateChannel(channel, userId))) {
            throw new common_1.ForbiddenException('Only the channel creator or a workspace admin can archive this channel');
        }
        const [row] = await this.db
            .update(db_1.chatChannels)
            .set({ archivedAt: archived ? new Date() : null })
            .where((0, drizzle_orm_1.eq)(db_1.chatChannels.id, channelId))
            .returning();
        this.realtime.emitToWorkspace(channel.workspaceId, {
            type: 'chat.channel.created',
            workspaceId: channel.workspaceId,
            channel: row,
        });
        return row;
    }
    /**
     * List a workspace's archived channels (Plan §6.1) so members can review /
     * unarchive them. Mirrors listChannels' visibility: private channels only
     * show to their members. DMs are never archived here, so excluded.
     */
    async listArchivedChannels(workspaceId, userId) {
        const [membership] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!membership)
            throw new common_1.ForbiddenException('Workspace membership required');
        const rows = await this.db
            .select({
            id: db_1.chatChannels.id,
            name: db_1.chatChannels.name,
            description: db_1.chatChannels.description,
            icon: db_1.chatChannels.icon,
            spaceId: db_1.chatChannels.spaceId,
            isPrivate: db_1.chatChannels.isPrivate,
            isDm: db_1.chatChannels.isDm,
            createdById: db_1.chatChannels.createdById,
            archivedAt: db_1.chatChannels.archivedAt,
            createdAt: db_1.chatChannels.createdAt,
        })
            .from(db_1.chatChannels)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.isNotNull)(db_1.chatChannels.archivedAt), (0, drizzle_orm_1.eq)(db_1.chatChannels.isDm, false)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.chatChannels.archivedAt));
        const memberships = await this.db
            .select({ channelId: db_1.chatChannelMembers.channelId })
            .from(db_1.chatChannelMembers)
            .where((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.userId, userId));
        const memberSet = new Set(memberships.map((m) => m.channelId));
        return rows
            .filter((c) => !c.isPrivate || memberSet.has(c.id))
            .map((c) => ({ ...c, joined: memberSet.has(c.id) }));
    }
    /**
     * The caller's channel groups for a workspace (§A3.4), each with the channels
     * they've filed into it. Space-derived grouping stays as the fallback in the
     * sidebar for anything that isn't in a group.
     */
    async listChannelGroups(workspaceId, userId) {
        const groups = await this.db
            .select({
            id: db_1.chatChannelGroups.id,
            name: db_1.chatChannelGroups.name,
            position: db_1.chatChannelGroups.position,
            isCollapsed: db_1.chatChannelGroups.isCollapsed,
        })
            .from(db_1.chatChannelGroups)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannelGroups.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.chatChannelGroups.userId, userId)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.chatChannelGroups.position), (0, drizzle_orm_1.asc)(db_1.chatChannelGroups.createdAt));
        if (groups.length === 0)
            return [];
        const items = await this.db
            .select({ groupId: db_1.chatChannelGroupItems.groupId, channelId: db_1.chatChannelGroupItems.channelId })
            .from(db_1.chatChannelGroupItems)
            .where((0, drizzle_orm_1.inArray)(db_1.chatChannelGroupItems.groupId, groups.map((g) => g.id)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.chatChannelGroupItems.position), (0, drizzle_orm_1.asc)(db_1.chatChannelGroupItems.createdAt));
        const byGroup = new Map();
        for (const item of items) {
            const list = byGroup.get(item.groupId) ?? [];
            list.push(item.channelId);
            byGroup.set(item.groupId, list);
        }
        return groups.map((g) => ({ ...g, channelIds: byGroup.get(g.id) ?? [] }));
    }
    normalizeGroupName(name) {
        const trimmed = (name ?? '').trim().slice(0, 60);
        if (!trimmed)
            throw new common_1.BadRequestException('Group name required');
        return trimmed;
    }
    /** The caller's own group, or 404. Groups are private to their owner. */
    async assertOwnGroup(groupId, userId) {
        const [group] = await this.db
            .select()
            .from(db_1.chatChannelGroups)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannelGroups.id, groupId), (0, drizzle_orm_1.eq)(db_1.chatChannelGroups.userId, userId)))
            .limit(1);
        if (!group)
            throw new common_1.NotFoundException('Channel group not found');
        return group;
    }
    async createChannelGroup(workspaceId, userId, name) {
        const [membership] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!membership)
            throw new common_1.ForbiddenException('Workspace membership required');
        const [{ next } = { next: 0 }] = await this.db
            .select({ next: (0, drizzle_orm_1.sql) `coalesce(max(${db_1.chatChannelGroups.position}), -1) + 1` })
            .from(db_1.chatChannelGroups)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannelGroups.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.chatChannelGroups.userId, userId)));
        const [row] = await this.db
            .insert(db_1.chatChannelGroups)
            .values({ workspaceId, userId, name: this.normalizeGroupName(name), position: next })
            .returning();
        return { ...row, channelIds: [] };
    }
    async updateChannelGroup(groupId, userId, patch) {
        await this.assertOwnGroup(groupId, userId);
        const set = {};
        if (patch.name !== undefined)
            set.name = this.normalizeGroupName(patch.name);
        if (patch.isCollapsed !== undefined)
            set.isCollapsed = !!patch.isCollapsed;
        if (patch.position !== undefined)
            set.position = Math.max(0, Math.floor(patch.position));
        if (Object.keys(set).length === 0)
            return this.assertOwnGroup(groupId, userId);
        const [row] = await this.db
            .update(db_1.chatChannelGroups)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.chatChannelGroups.id, groupId))
            .returning();
        return row;
    }
    /** Delete a group. Its channels fall back to space-derived grouping. */
    async deleteChannelGroup(groupId, userId) {
        await this.assertOwnGroup(groupId, userId);
        await this.db.delete(db_1.chatChannelGroups).where((0, drizzle_orm_1.eq)(db_1.chatChannelGroups.id, groupId));
        return { ok: true };
    }
    /**
     * File a channel into one of the caller's groups (§A3.4). A channel lives in
     * at most one group per user, so this clears any previous placement first —
     * otherwise the rail would render the channel under two headings.
     */
    async addChannelToGroup(groupId, userId, channelId) {
        const group = await this.assertOwnGroup(groupId, userId);
        const channel = await this.assertChannelAccess(channelId, userId);
        if (channel.workspaceId !== group.workspaceId) {
            throw new common_1.BadRequestException('Channel belongs to another workspace');
        }
        const mine = await this.db
            .select({ id: db_1.chatChannelGroups.id })
            .from(db_1.chatChannelGroups)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannelGroups.workspaceId, group.workspaceId), (0, drizzle_orm_1.eq)(db_1.chatChannelGroups.userId, userId)));
        await this.db
            .delete(db_1.chatChannelGroupItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannelGroupItems.channelId, channelId), (0, drizzle_orm_1.inArray)(db_1.chatChannelGroupItems.groupId, mine.map((g) => g.id))));
        const [{ next } = { next: 0 }] = await this.db
            .select({ next: (0, drizzle_orm_1.sql) `coalesce(max(${db_1.chatChannelGroupItems.position}), -1) + 1` })
            .from(db_1.chatChannelGroupItems)
            .where((0, drizzle_orm_1.eq)(db_1.chatChannelGroupItems.groupId, groupId));
        await this.db.insert(db_1.chatChannelGroupItems).values({ groupId, channelId, position: next });
        return { ok: true };
    }
    async removeChannelFromGroup(groupId, userId, channelId) {
        await this.assertOwnGroup(groupId, userId);
        await this.db
            .delete(db_1.chatChannelGroupItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannelGroupItems.groupId, groupId), (0, drizzle_orm_1.eq)(db_1.chatChannelGroupItems.channelId, channelId)));
        return { ok: true };
    }
    async joinChannel(channelId, userId) {
        const access = await this.assertChannelAccess(channelId, userId);
        // A share is permission to look, not an invitation to join. Letting a
        // share-only visitor become a member would survive the share being revoked.
        if (this.isShareOnlyVisitor(access)) {
            throw new common_1.ForbiddenException('This channel was shared with you; ask a member to add you to join it');
        }
        await this.db
            .insert(db_1.chatChannelMembers)
            .values({ channelId, userId })
            .onConflictDoNothing();
        return { ok: true };
    }
    /** Add other workspace members to a channel (enables group conversations). */
    async addChannelMembers(channelId, actorId, userIds) {
        const channel = await this.assertChannelAccess(channelId, actorId);
        const unique = [...new Set((userIds ?? []).filter(Boolean))];
        if (unique.length === 0)
            return { ok: true, added: 0 };
        // Only add users who belong to the channel's workspace.
        const wsMembers = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, channel.workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.userId, unique)));
        const valid = wsMembers.map((m) => m.userId);
        if (valid.length === 0)
            return { ok: true, added: 0 };
        await this.db
            .insert(db_1.chatChannelMembers)
            .values(valid.map((userId) => ({ channelId, userId })))
            .onConflictDoNothing();
        this.realtime.emitToWorkspace(channel.workspaceId, {
            type: 'chat.channel.members.added',
            workspaceId: channel.workspaceId,
            channelId,
        });
        return { ok: true, added: valid.length };
    }
    async listChannelMembers(channelId, userId) {
        await this.assertChannelAccess(channelId, userId);
        return this.db
            .select({
            userId: db_1.chatChannelMembers.userId,
            displayName: db_1.users.displayName,
            email: db_1.users.email,
            avatarUrl: db_1.users.avatarUrl,
            joinedAt: db_1.chatChannelMembers.joinedAt,
        })
            .from(db_1.chatChannelMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatChannelMembers.userId))
            .where((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, channelId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.chatChannelMembers.joinedAt));
    }
    /**
     * Read state per channel member (Plan §6 read receipts). A member has "seen"
     * a message when their lastReadAt (set on opening the channel) is at/after the
     * message's createdAt — so the client can render "Seen by …" per message
     * without a per-message receipts table.
     */
    async getChannelReceipts(channelId, userId) {
        await this.assertChannelAccess(channelId, userId);
        return this.db
            .select({
            userId: db_1.chatChannelMembers.userId,
            displayName: db_1.users.displayName,
            lastReadAt: db_1.chatChannelMembers.lastReadAt,
            // Delivery marker (Plan §6.2): drives the "Delivered" state that precedes
            // "Seen" on the sender's own messages.
            lastDeliveredAt: db_1.chatChannelMembers.lastDeliveredAt,
        })
            .from(db_1.chatChannelMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatChannelMembers.userId))
            .where((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, channelId));
    }
    async leaveChannel(channelId, userId) {
        await this.assertChannelAccess(channelId, userId);
        await this.db
            .delete(db_1.chatChannelMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, channelId), (0, drizzle_orm_1.eq)(db_1.chatChannelMembers.userId, userId)));
        return { ok: true };
    }
    // --- Custom workspace emoji (Plan §6) -----------------------------------
    async assertWorkspaceRole(workspaceId, userId) {
        const [m] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!m)
            throw new common_1.ForbiddenException('Workspace membership required');
        return m.role;
    }
    async listCustomEmoji(workspaceId, userId) {
        await this.assertWorkspaceRole(workspaceId, userId);
        const rows = await this.db
            .select({
            id: db_1.chatCustomEmoji.id,
            shortcode: db_1.chatCustomEmoji.shortcode,
            imageUrl: db_1.chatCustomEmoji.imageUrl,
            storageKey: db_1.chatCustomEmoji.storageKey,
            createdById: db_1.chatCustomEmoji.createdById,
        })
            .from(db_1.chatCustomEmoji)
            .where((0, drizzle_orm_1.eq)(db_1.chatCustomEmoji.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.chatCustomEmoji.shortcode));
        // Uploaded emoji (§A3.8) are stored by object key, so their URL is signed
        // fresh on every read; emoji added by URL pass through untouched.
        return Promise.all(rows.map(async ({ storageKey, ...emoji }) => ({
            ...emoji,
            imageUrl: storageKey && this.r2.configured ? await this.r2.getObjectUrl(storageKey) : emoji.imageUrl,
        })));
    }
    /**
     * Presign a direct-to-R2 upload for a custom emoji image (§A3.8). Mirrors the
     * attachment presign path so emoji can be uploaded instead of only linked.
     */
    async createCustomEmojiUploadUrl(workspaceId, userId, body) {
        await this.assertWorkspaceRole(workspaceId, userId);
        if (!this.r2.configured)
            throw new common_1.BadRequestException('R2 storage is not configured');
        const contentType = body.contentType || '';
        if (!contentType.startsWith('image/'))
            throw new common_1.BadRequestException('Emoji must be an image');
        if (body.sizeBytes != null && body.sizeBytes > exports.MAX_CUSTOM_EMOJI_BYTES) {
            throw new common_1.BadRequestException(`Emoji image exceeds the ${Math.round(exports.MAX_CUSTOM_EMOJI_BYTES / 1024)} KB limit`);
        }
        const fileName = this.sanitizeFileName(body.fileName);
        const key = `chat/${workspaceId}/emoji/${Date.now()}-${fileName}`;
        const uploadUrl = await this.r2.presignPutObject(key, contentType, { uploadedby: userId });
        return { uploadUrl, storageKey: key };
    }
    async addCustomEmoji(workspaceId, userId, shortcode, imageUrl, storageKey) {
        await this.assertWorkspaceRole(workspaceId, userId);
        const code = (shortcode ?? '').trim().toLowerCase().replace(/:/g, '');
        if (!/^[a-z0-9_]{2,32}$/.test(code)) {
            throw new common_1.BadRequestException('Shortcode must be 2–32 lowercase letters, numbers, or underscores');
        }
        // An uploaded emoji is identified by its object key; imageUrl then only
        // holds the signature that was current at upload time, so it is never
        // trusted on read.
        const key = storageKey?.trim();
        if (key) {
            if (!key.startsWith(`chat/${workspaceId}/emoji/`))
                throw new common_1.BadRequestException('Invalid storageKey');
        }
        else if (!/^https?:\/\/\S+$/.test(imageUrl ?? '')) {
            throw new common_1.BadRequestException('imageUrl must be an http(s) URL');
        }
        const [row] = await this.db
            .insert(db_1.chatCustomEmoji)
            .values({ workspaceId, shortcode: code, imageUrl: imageUrl ?? '', storageKey: key ?? null, createdById: userId })
            .onConflictDoNothing()
            .returning();
        if (!row)
            throw new common_1.BadRequestException(`:${code}: already exists in this workspace`);
        return {
            ...row,
            imageUrl: key && this.r2.configured ? await this.r2.getObjectUrl(key) : row.imageUrl,
        };
    }
    async deleteCustomEmoji(emojiId, userId) {
        const [emoji] = await this.db.select().from(db_1.chatCustomEmoji).where((0, drizzle_orm_1.eq)(db_1.chatCustomEmoji.id, emojiId));
        if (!emoji)
            throw new common_1.NotFoundException('Emoji not found');
        const role = await this.assertWorkspaceRole(emoji.workspaceId, userId);
        const isModerator = role === 'workspace_admin' || role === 'super_admin';
        if (emoji.createdById !== userId && !isModerator) {
            throw new common_1.ForbiddenException('Only the creator or a workspace admin can delete this emoji');
        }
        await this.db.delete(db_1.chatCustomEmoji).where((0, drizzle_orm_1.eq)(db_1.chatCustomEmoji.id, emojiId));
        return { ok: true };
    }
    /** Remove another member from a channel (Plan §6). Only the channel creator
     *  or a workspace admin may do this; the creator can't be removed. */
    async removeChannelMember(channelId, actorId, targetUserId) {
        const channel = await this.assertChannelAccess(channelId, actorId);
        if (targetUserId === actorId) {
            // Removing yourself is "leave", not "remove".
            return this.leaveChannel(channelId, actorId);
        }
        if (!(await this.canModerateChannel(channel, actorId))) {
            throw new common_1.ForbiddenException('Only the channel creator or a workspace admin can remove members');
        }
        if (channel.createdById === targetUserId) {
            throw new common_1.ForbiddenException('The channel creator cannot be removed');
        }
        await this.db
            .delete(db_1.chatChannelMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, channelId), (0, drizzle_orm_1.eq)(db_1.chatChannelMembers.userId, targetUserId)));
        this.realtime.emitToWorkspace(channel.workspaceId, {
            type: 'chat.channel.members.updated',
            workspaceId: channel.workspaceId,
            channelId,
        });
        return { ok: true };
    }
    async listMessages(channelId, userId, opts = {}) {
        await this.assertChannelAccess(channelId, userId);
        const limit = Math.min(opts.limit ?? 50, 200);
        // Keyset pagination (§6): when a `before` message id is supplied, only load
        // root messages strictly older than that message so the client can page
        // backwards through channel history. Without this the cursor was a no-op
        // and only the newest `limit` messages were ever reachable.
        let beforeCreatedAt = null;
        if (opts.before) {
            const [cursor] = await this.db
                .select({ createdAt: db_1.chatMessages.createdAt })
                .from(db_1.chatMessages)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatMessages.id, opts.before), (0, drizzle_orm_1.eq)(db_1.chatMessages.channelId, channelId)))
                .limit(1);
            beforeCreatedAt = cursor?.createdAt ?? null;
        }
        const where = beforeCreatedAt
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatMessages.channelId, channelId), (0, drizzle_orm_1.isNull)(db_1.chatMessages.parentMessageId), (0, drizzle_orm_1.lt)(db_1.chatMessages.createdAt, beforeCreatedAt))
            : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatMessages.channelId, channelId), (0, drizzle_orm_1.isNull)(db_1.chatMessages.parentMessageId));
        const rows = await this.db
            .select({
            id: db_1.chatMessages.id,
            channelId: db_1.chatMessages.channelId,
            authorId: db_1.chatMessages.authorId,
            body: db_1.chatMessages.body,
            mentions: db_1.chatMessages.mentions,
            editedAt: db_1.chatMessages.editedAt,
            pinnedAt: db_1.chatMessages.pinnedAt,
            pinnedById: db_1.chatMessages.pinnedById,
            deletedAt: db_1.chatMessages.deletedAt,
            createdAt: db_1.chatMessages.createdAt,
            authorName: db_1.users.displayName,
            authorAvatarUrl: db_1.users.avatarUrl,
            // §12 — where this was forwarded from, if it was.
            forwardedFromId: db_1.chatMessages.forwardedFromId,
            // §2.8 gap 9 — set when this message IS a call card.
            callId: db_1.chatMessages.callId,
        })
            .from(db_1.chatMessages)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatMessages.authorId))
            .where(where)
            .orderBy((0, drizzle_orm_1.desc)(db_1.chatMessages.createdAt))
            .limit(limit);
        const ordered = rows.reverse();
        if (ordered.length === 0)
            return ordered;
        // Delivery/read receipts of the OTHER members (Plan §6.2) so each of the
        // caller's own messages can carry a 'sent' | 'delivered' | 'seen' status.
        const otherMembers = await this.db
            .select({
            lastReadAt: db_1.chatChannelMembers.lastReadAt,
            lastDeliveredAt: db_1.chatChannelMembers.lastDeliveredAt,
        })
            .from(db_1.chatChannelMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, channelId), (0, drizzle_orm_1.ne)(db_1.chatChannelMembers.userId, userId)));
        const messageIds = ordered.map((m) => m.id);
        const reactionRows = await this.db
            .select({
            messageId: db_1.chatMessageReactions.messageId,
            emoji: db_1.chatMessageReactions.emoji,
            userId: db_1.chatMessageReactions.userId,
        })
            .from(db_1.chatMessageReactions)
            .where((0, drizzle_orm_1.or)(...messageIds.map((id) => (0, drizzle_orm_1.eq)(db_1.chatMessageReactions.messageId, id))));
        const grouped = new Map();
        for (const reaction of reactionRows) {
            const byEmoji = grouped.get(reaction.messageId) ?? new Map();
            const users = byEmoji.get(reaction.emoji) ?? new Set();
            users.add(reaction.userId);
            byEmoji.set(reaction.emoji, users);
            grouped.set(reaction.messageId, byEmoji);
        }
        // Reactor identities (Plan §6.5): map each reactor id → display name so the
        // client can show "Alice, Bob reacted with 👍" on the reaction pill.
        const reactorIds = [...new Set(reactionRows.map((r) => r.userId))];
        const reactorNames = reactorIds.length
            ? await this.db.select({ id: db_1.users.id, name: db_1.users.displayName }).from(db_1.users).where((0, drizzle_orm_1.inArray)(db_1.users.id, reactorIds))
            : [];
        const reactorNameById = new Map(reactorNames.map((r) => [r.id, r.name]));
        const reactorUsers = (ids) => [...ids].map((id) => ({ id, name: reactorNameById.get(id) ?? 'teammate' }));
        // Hydrate per-message attachments (Plan §6.8). Separate query, keyed by
        // message id, with fresh signed download URLs.
        const attachmentRows = await this.db
            .select()
            .from(db_1.chatMessageAttachments)
            .where((0, drizzle_orm_1.inArray)(db_1.chatMessageAttachments.messageId, messageIds));
        const attachmentsByMessage = new Map();
        for (const a of attachmentRows) {
            if (!a.messageId)
                continue;
            const list = attachmentsByMessage.get(a.messageId) ?? [];
            list.push({
                id: a.id,
                fileName: a.fileName,
                contentType: a.contentType,
                sizeBytes: a.sizeBytes,
                storageKey: a.storageKey,
                url: this.r2.configured ? await this.r2.getObjectUrl(a.storageKey) : a.storageKey,
            });
            attachmentsByMessage.set(a.messageId, list);
        }
        // Thread stats (Plan §6.4): per root message, the reply count and the latest
        // reply's timestamp so the parent can render "Last reply 3h ago" inline.
        // Deleted-tombstone replies still count (they occupy the thread).
        const replyStatRows = await this.db
            .select({
            parentId: db_1.chatMessages.parentMessageId,
            replyCount: (0, drizzle_orm_1.sql) `count(*)::int`,
            lastReplyAt: (0, drizzle_orm_1.sql) `max(${db_1.chatMessages.createdAt})`,
        })
            .from(db_1.chatMessages)
            .where((0, drizzle_orm_1.inArray)(db_1.chatMessages.parentMessageId, messageIds))
            .groupBy(db_1.chatMessages.parentMessageId);
        const replyStatByParent = new Map(replyStatRows.map((r) => [r.parentId, { replyCount: r.replyCount, lastReplyAt: r.lastReplyAt }]));
        /*
         * §12 — resolve where each forwarded message came from, for "View Message".
         *
         * Access is re-checked here against *the reader*, not the forwarder. Those
         * are different people: forwarding was authorised when it happened, against
         * whoever did it, and the recipient may have no business in the source
         * channel at all. Offering them a link would be an invitation to a room
         * they were never in. When the source is out of reach the message still
         * says it was forwarded — it just does not offer to take you there, which
         * is the truthful version of the same fact.
         */
        const forwardIds = [...new Set(ordered.map((m) => m.forwardedFromId).filter(Boolean))];
        const forwardedFrom = new Map();
        if (forwardIds.length > 0) {
            const sources = await this.db
                .select({
                id: db_1.chatMessages.id,
                channelId: db_1.chatChannels.id,
                channelName: db_1.chatChannels.name,
                isPrivate: db_1.chatChannels.isPrivate,
                isDm: db_1.chatChannels.isDm,
                authorName: db_1.users.displayName,
                sentAt: db_1.chatMessages.createdAt,
            })
                .from(db_1.chatMessages)
                .innerJoin(db_1.chatChannels, (0, drizzle_orm_1.eq)(db_1.chatChannels.id, db_1.chatMessages.channelId))
                // Left, not inner: a deleted author must not make the whole forward
                // banner disappear along with them.
                .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatMessages.authorId))
                .where((0, drizzle_orm_1.inArray)(db_1.chatMessages.id, forwardIds));
            const myChannels = new Set((await this.db
                .select({ channelId: db_1.chatChannelMembers.channelId })
                .from(db_1.chatChannelMembers)
                .where((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.userId, userId))).map((r) => r.channelId));
            for (const src of sources) {
                const reachable = (!src.isPrivate && !src.isDm) || myChannels.has(src.channelId);
                forwardedFrom.set(src.id, reachable
                    ? {
                        channelId: src.channelId,
                        channelName: src.channelName,
                        authorName: src.authorName,
                        sentAt: src.sentAt,
                    }
                    : null);
            }
        }
        /*
         * §2.8 gap 9 — hydrate the call behind each card.
         *
         * The card is not a snapshot of the moment the call started: it has to say
         * "You're in the SyncUp", "Join the SyncUp" or "SyncUp Ended · lasted 45s"
         * depending on what is true NOW, an hour later, for whoever is reading. So
         * it carries live state rather than frozen text, and the reader's own
         * presence is resolved here — the client cannot be trusted to know whether
         * a `leftAt` it has not refetched is still null.
         */
        const callIds = [...new Set(ordered.map((m) => m.callId).filter(Boolean))];
        const callById = new Map();
        if (callIds.length > 0) {
            const callRows = await this.db
                .select({
                id: db_1.calls.id,
                startedAt: db_1.calls.startedAt,
                endedAt: db_1.calls.endedAt,
                recording: db_1.calls.recording,
                startedById: db_1.calls.startedById,
            })
                .from(db_1.calls)
                .where((0, drizzle_orm_1.inArray)(db_1.calls.id, callIds));
            const participantRows = await this.db
                .select({
                callId: db_1.callParticipants.callId,
                userId: db_1.callParticipants.userId,
                leftAt: db_1.callParticipants.leftAt,
            })
                .from(db_1.callParticipants)
                .where((0, drizzle_orm_1.inArray)(db_1.callParticipants.callId, callIds));
            for (const call of callRows) {
                const mine = participantRows.filter((p) => p.callId === call.id);
                callById.set(call.id, {
                    ...call,
                    startedAt: call.startedAt.toISOString(),
                    endedAt: call.endedAt ? call.endedAt.toISOString() : null,
                    // Everyone who was ever in it — "1 person joined" is a fact about the
                    // whole call, not about who happens to be there as you read this.
                    joinedCount: new Set(mine.map((p) => p.userId)).size,
                    presentCount: mine.filter((p) => !p.leftAt).length,
                    youArePresent: mine.some((p) => p.userId === userId && !p.leftAt),
                });
            }
        }
        /*
         * §G11 [15:36] — who this message is assigned to, and whether it is done.
         *
         * Hydrated with the messages rather than fetched per message on hover: an
         * assignment has to be visible on the message itself, otherwise it is a
         * fact you can only discover by opening the menu that created it, which is
         * the same as not having it.
         */
        const assignmentRows = await this.db
            .select({
            id: db_1.chatMessageAssignments.id,
            messageId: db_1.chatMessageAssignments.messageId,
            assigneeId: db_1.chatMessageAssignments.assigneeId,
            assignedById: db_1.chatMessageAssignments.assignedById,
            dueAt: db_1.chatMessageAssignments.dueAt,
            resolvedAt: db_1.chatMessageAssignments.resolvedAt,
            assigneeName: db_1.users.displayName,
            assigneeAvatarUrl: db_1.users.avatarUrl,
        })
            .from(db_1.chatMessageAssignments)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatMessageAssignments.assigneeId))
            .where((0, drizzle_orm_1.inArray)(db_1.chatMessageAssignments.messageId, messageIds));
        const assignmentsByMessage = new Map();
        for (const a of assignmentRows) {
            const list = assignmentsByMessage.get(a.messageId) ?? [];
            list.push(a);
            assignmentsByMessage.set(a.messageId, list);
        }
        /*
         * §G12 [17:13] — the reader's own stance on each thread.
         *
         * Only rows for threads on this page, and only this reader's: "muted" is a
         * private decision, and showing the bell struck through on somebody else's
         * screen would leak it.
         */
        const followRows = await this.db
            .select({ parentMessageId: db_1.chatThreadFollows.parentMessageId, state: db_1.chatThreadFollows.state })
            .from(db_1.chatThreadFollows)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatThreadFollows.userId, userId), (0, drizzle_orm_1.inArray)(db_1.chatThreadFollows.parentMessageId, messageIds)));
        const followByParent = new Map(followRows.map((r) => [r.parentMessageId, r.state]));
        return ordered.map((message) => {
            const byEmoji = grouped.get(message.id);
            const reactions = byEmoji
                ? [...byEmoji.entries()].map(([emoji, ids]) => ({
                    emoji,
                    count: ids.size,
                    reacted: ids.has(userId),
                    users: reactorUsers(ids),
                }))
                : [];
            const stats = replyStatByParent.get(message.id);
            // Delivery indicator only for the caller's own messages (Plan §6.2);
            // null for others so the UI never renders it on someone else's message.
            const deliveryStatus = message.authorId === userId ? computeDeliveryStatus(message.createdAt, otherMembers) : null;
            return {
                ...message,
                // null when it was forwarded from somewhere this reader cannot follow.
                forwardedFrom: message.forwardedFromId
                    ? forwardedFrom.get(message.forwardedFromId) ?? null
                    : null,
                reactions,
                attachments: attachmentsByMessage.get(message.id) ?? [],
                replyCount: stats?.replyCount ?? 0,
                lastReplyAt: stats?.lastReplyAt ?? null,
                deliveryStatus,
                // §2.8 gap 9 — null on an ordinary message; the card's live state on a
                // call card. Null on a card whose call has been deleted, too, which is
                // why the message keeps its plain-words body.
                call: message.callId ? callById.get(message.callId) ?? null : null,
                // §G11 — empty on a message nobody has been asked to act on.
                assignments: (assignmentsByMessage.get(message.id) ?? []).map((a) => ({
                    id: a.id,
                    assigneeId: a.assigneeId,
                    assigneeName: a.assigneeName,
                    assigneeAvatarUrl: a.assigneeAvatarUrl,
                    assignedById: a.assignedById,
                    dueAt: a.dueAt,
                    resolvedAt: a.resolvedAt,
                })),
                // §G12 — 'following' | 'muted' | null, meaning "I have not said".
                threadFollowState: followByParent.get(message.id) ?? null,
            };
        });
    }
    async getMemberActivity(workspaceId, requesterId, memberUserId, limit = 30) {
        const [requesterMembership] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, requesterId)))
            .limit(1);
        if (!requesterMembership)
            throw new common_1.ForbiddenException('Workspace membership required');
        const [memberMembership] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, memberUserId)))
            .limit(1);
        if (!memberMembership)
            return [];
        return this.db
            .select({
            id: db_1.chatMessages.id,
            channelId: db_1.chatMessages.channelId,
            channelName: db_1.chatChannels.name,
            body: db_1.chatMessages.body,
            parentMessageId: db_1.chatMessages.parentMessageId,
            createdAt: db_1.chatMessages.createdAt,
        })
            .from(db_1.chatMessages)
            .innerJoin(db_1.chatChannels, (0, drizzle_orm_1.eq)(db_1.chatChannels.id, db_1.chatMessages.channelId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.chatMessages.authorId, memberUserId)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.chatMessages.createdAt))
            .limit(Math.min(Math.max(limit, 1), 100));
    }
    async getMessageById(messageId, userId) {
        const [row] = await this.db
            .select({
            id: db_1.chatMessages.id,
            channelId: db_1.chatMessages.channelId,
            authorId: db_1.chatMessages.authorId,
            body: db_1.chatMessages.body,
            mentions: db_1.chatMessages.mentions,
            parentMessageId: db_1.chatMessages.parentMessageId,
            editedAt: db_1.chatMessages.editedAt,
            pinnedAt: db_1.chatMessages.pinnedAt,
            createdAt: db_1.chatMessages.createdAt,
            authorName: db_1.users.displayName,
            authorAvatarUrl: db_1.users.avatarUrl,
        })
            .from(db_1.chatMessages)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatMessages.authorId))
            .where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Message not found');
        await this.assertChannelAccess(row.channelId, userId);
        const reactionRows = await this.db
            .select({
            emoji: db_1.chatMessageReactions.emoji,
            userId: db_1.chatMessageReactions.userId,
        })
            .from(db_1.chatMessageReactions)
            .where((0, drizzle_orm_1.eq)(db_1.chatMessageReactions.messageId, messageId));
        const grouped = new Map();
        for (const reaction of reactionRows) {
            const usersForEmoji = grouped.get(reaction.emoji) ?? new Set();
            usersForEmoji.add(reaction.userId);
            grouped.set(reaction.emoji, usersForEmoji);
        }
        // Reactor identities (Plan §6.5) so the pill tooltip can name who reacted.
        const reactorIds = [...new Set(reactionRows.map((r) => r.userId))];
        const reactorNames = reactorIds.length
            ? await this.db.select({ id: db_1.users.id, name: db_1.users.displayName }).from(db_1.users).where((0, drizzle_orm_1.inArray)(db_1.users.id, reactorIds))
            : [];
        const reactorNameById = new Map(reactorNames.map((r) => [r.id, r.name]));
        const reactions = [...grouped.entries()].map(([emoji, usersForEmoji]) => ({
            emoji,
            count: usersForEmoji.size,
            reacted: usersForEmoji.has(userId),
            users: [...usersForEmoji].map((id) => ({ id, name: reactorNameById.get(id) ?? 'teammate' })),
        }));
        /*
         * §G12 — the reader's stance, same field name listMessages uses.
         *
         * The thread panel prefers the message from the loaded page and falls back
         * to this one when the parent has scrolled out of it. If only one of the
         * two carried the stance, the bell would light up or not depending on how
         * far you had scrolled, which is the sort of bug that gets filed as
         * "sometimes it forgets".
         */
        const [stance] = await this.db
            .select({ state: db_1.chatThreadFollows.state })
            .from(db_1.chatThreadFollows)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatThreadFollows.parentMessageId, row.parentMessageId ?? row.id), (0, drizzle_orm_1.eq)(db_1.chatThreadFollows.userId, userId)))
            .limit(1);
        return { ...row, reactions, threadFollowState: stance?.state ?? null };
    }
    async getThread(messageId, userId, limit = 100) {
        /*
         * §G12-2 — a thread is the same thread whichever message in it you name.
         *
         * Rooted at the parent, not at the id passed in. The Replies page opens a
         * thread from a NOTIFICATION, and a reply notification carries the id of
         * the reply — so asking for that id returned the reply as the "parent" with
         * an empty list of replies under it: a thread that reads as having nothing
         * in it, which is the opposite of why you opened it.
         */
        const named = await this.getMessageById(messageId, userId);
        const parent = named.parentMessageId
            ? await this.getMessageById(named.parentMessageId, userId)
            : named;
        const rows = await this.db
            .select({
            id: db_1.chatMessages.id,
            channelId: db_1.chatMessages.channelId,
            authorId: db_1.chatMessages.authorId,
            body: db_1.chatMessages.body,
            mentions: db_1.chatMessages.mentions,
            parentMessageId: db_1.chatMessages.parentMessageId,
            editedAt: db_1.chatMessages.editedAt,
            pinnedAt: db_1.chatMessages.pinnedAt,
            createdAt: db_1.chatMessages.createdAt,
            authorName: db_1.users.displayName,
            authorAvatarUrl: db_1.users.avatarUrl,
        })
            .from(db_1.chatMessages)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatMessages.authorId))
            .where((0, drizzle_orm_1.eq)(db_1.chatMessages.parentMessageId, parent.id))
            .orderBy((0, drizzle_orm_1.asc)(db_1.chatMessages.createdAt))
            .limit(Math.min(Math.max(limit, 1), 200));
        return { parent, replies: rows };
    }
    async postMessage(data) {
        this.assertCanPost(await this.assertChannelAccess(data.channelId, data.authorId));
        const body = data.body.trim();
        const attachmentIds = (data.attachmentIds ?? []).filter(Boolean);
        // A message must carry either text or at least one attachment (Plan §6.8).
        if (!body && attachmentIds.length === 0)
            throw new common_1.ForbiddenException('Message body required');
        const [channel] = await this.db.select().from(db_1.chatChannels).where((0, drizzle_orm_1.eq)(db_1.chatChannels.id, data.channelId));
        if (!channel)
            throw new common_1.NotFoundException('Channel not found');
        const parsedMentionIds = this.extractMentionIds(body);
        const mentionIds = new Set([
            ...(data.mentions ?? []).map((m) => m.userId),
            ...parsedMentionIds,
        ]);
        const normalizedMentions = [...mentionIds].map((userId) => ({ userId, offset: 0, length: 0 }));
        /*
         * §12 — forwarding, checked before it is recorded.
         *
         * The id names a message in some other channel, so it has to be read
         * through the same access check as everything else: without it, forwarding
         * a message you cannot see would mint a permanent link to it, and "View
         * Message" would be an invitation to a channel you were never in. An
         * unreadable or unknown source is dropped rather than refused — the forward
         * still lands, just as an ordinary message, which is what it is without a
         * source anyone can follow.
         */
        let forwardedFromId = null;
        if (data.forwardedFromId) {
            const [source] = await this.db
                .select({ id: db_1.chatMessages.id, channelId: db_1.chatMessages.channelId })
                .from(db_1.chatMessages)
                .where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, data.forwardedFromId))
                .limit(1);
            if (source) {
                const readable = await this.assertChannelAccess(source.channelId, data.authorId).then(() => true, () => false);
                if (readable)
                    forwardedFromId = source.id;
            }
        }
        const [row] = await this.db
            .insert(db_1.chatMessages)
            .values({
            channelId: data.channelId,
            authorId: data.authorId,
            body,
            parentMessageId: data.parentMessageId ?? null,
            mentions: normalizedMentions.length > 0 ? normalizedMentions : null,
            forwardedFromId,
        })
            .returning();
        // Link any pre-uploaded attachments to this message. Only rows belonging to
        // this channel and still unlinked (message_id null) are claimed, so an id
        // can't be smuggled across channels or re-attached to a second message.
        let attachments = [];
        if (attachmentIds.length > 0) {
            const linked = await this.db
                .update(db_1.chatMessageAttachments)
                .set({ messageId: row.id })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatMessageAttachments.channelId, data.channelId), (0, drizzle_orm_1.isNull)(db_1.chatMessageAttachments.messageId), (0, drizzle_orm_1.inArray)(db_1.chatMessageAttachments.id, attachmentIds)))
                .returning();
            attachments = await Promise.all(linked.map(async (a) => ({
                id: a.id,
                fileName: a.fileName,
                contentType: a.contentType,
                sizeBytes: a.sizeBytes,
                storageKey: a.storageKey,
                url: this.r2.configured ? await this.r2.getObjectUrl(a.storageKey) : a.storageKey,
            })));
        }
        const [author] = await this.db.select({ displayName: db_1.users.displayName, avatarUrl: db_1.users.avatarUrl }).from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.id, data.authorId));
        const enriched = { ...row, authorName: author?.displayName, authorAvatarUrl: author?.avatarUrl, attachments, reactions: [] };
        let channelLabel = `#${channel.name}`;
        if (channel.isDm) {
            const dmMembers = await this.db
                .select({
                userId: db_1.chatChannelMembers.userId,
                displayName: db_1.users.displayName,
            })
                .from(db_1.chatChannelMembers)
                .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatChannelMembers.userId))
                .where((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, data.channelId));
            const peer = dmMembers.find((m) => m.userId !== data.authorId);
            channelLabel = peer?.displayName ? peer.displayName : 'Direct message';
        }
        this.realtime.emitToWorkspace(channel.workspaceId, {
            type: 'chat.message.created',
            workspaceId: channel.workspaceId,
            channelId: data.channelId,
            message: enriched,
        });
        // Per-channel notification levels: 'all' (default) hears every message,
        // 'mentions' only @-mentions, 'none' is muted. Load member ids + levels once.
        const levelRows = await this.db
            .select({ userId: db_1.chatChannelMembers.userId, level: db_1.chatChannelMembers.notificationLevel })
            .from(db_1.chatChannelMembers)
            .where((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.channelId, data.channelId));
        const levelByUser = new Map(levelRows.map((r) => [r.userId, r.level]));
        const channelMemberIds = levelRows.map((r) => r.userId);
        /*
         * §G12 [17:13] — per-thread mute and follow, which override the channel.
         *
         * "10 groups mein se ek thread bohot noisy hai" — silencing the channel to
         * escape one thread also silences the messages you are there for, so the
         * more specific answer wins over the channel-wide one in BOTH directions:
         * muted beats level 'all', and following beats level 'none'.
         *
         * Only for replies. A root message is not in a thread yet, so there is
         * nothing about it anybody can have muted.
         */
        const threadRootId = data.parentMessageId ?? null;
        const threadStanceByUser = new Map();
        if (threadRootId) {
            const stanceRows = await this.db
                .select({ userId: db_1.chatThreadFollows.userId, state: db_1.chatThreadFollows.state })
                .from(db_1.chatThreadFollows)
                .where((0, drizzle_orm_1.eq)(db_1.chatThreadFollows.parentMessageId, threadRootId));
            for (const s of stanceRows)
                threadStanceByUser.set(s.userId, s.state);
        }
        // Broadcast mentions @here / @channel (Plan §6.9): fan a mention-level ping
        // out to (present) channel members, respecting each member's DND + level.
        const special = this.extractSpecialMentions(body);
        const broadcastTargets = await this.resolveBroadcastTargets(data.channelId, data.authorId, special, channelMemberIds);
        // Everyone who should get a *mention* ping: explicit @uuid mentions (verified
        // as workspace members), @team handles, plus @here/@channel broadcast targets.
        const mentionTargets = new Set(broadcastTargets);
        const teamTargets = await this.resolveTeamMentionTargets(channel.workspaceId, body);
        if (mentionIds.size > 0 || teamTargets.size > 0) {
            const memberRows = await this.db
                .select({ userId: db_1.workspaceMembers.userId })
                .from(db_1.workspaceMembers)
                .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, channel.workspaceId));
            const workspaceMemberIds = new Set(memberRows.map((m) => m.userId));
            for (const userId of [...mentionIds, ...teamTargets]) {
                if (userId === data.authorId)
                    continue;
                if (!workspaceMemberIds.has(userId))
                    continue;
                mentionTargets.add(userId);
            }
        }
        for (const userId of mentionTargets) {
            if (userId === data.authorId)
                continue;
            // Muted members don't get pinged even on @mention / @channel.
            if ((levelByUser.get(userId) ?? 'all') === 'none')
                continue;
            void this.notifications.create({
                userId,
                workspaceId: channel.workspaceId,
                actorId: data.authorId,
                type: 'task_mentioned',
                title: channel.isDm ? `You were mentioned by ${author?.displayName ?? 'a teammate'}` : `You were mentioned in ${channelLabel}`,
                body: body.slice(0, 180),
                target: {
                    entityType: 'chat_message',
                    entityId: row.id,
                    url: `/app/${channel.workspaceId}/chat?channel=${data.channelId}&message=${row.id}`,
                },
                emailContext: { taskTitle: channelLabel, workspaceName: 'Workspace' },
            });
        }
        // Notify channel members about new messages (except author and already-mentioned users).
        const notifiedIds = new Set([...mentionTargets, data.authorId]);
        for (const userId of channelMemberIds) {
            if (notifiedIds.has(userId))
                continue;
            const stance = threadStanceByUser.get(userId);
            // Muted this thread — the one case where a level of 'all' is not the
            // last word. A direct @mention still reaches them: that loop ran above,
            // deliberately, because you cannot hide from being named.
            if (stance === 'muted')
                continue;
            // Following this thread — heard even at 'mentions' or 'none', which is
            // the point of asking to follow a thread inside a channel you muted.
            if (stance !== 'following' && (levelByUser.get(userId) ?? 'all') !== 'all')
                continue;
            void this.notifications.create({
                userId,
                workspaceId: channel.workspaceId,
                actorId: data.authorId,
                // §14 — a reply into a thread is its own kind, so the Replies page can
                // find it. Typed as a plain chat_message it never could.
                type: data.parentMessageId ? 'chat_reply' : 'chat_message',
                title: data.parentMessageId
                    ? channel.isDm
                        ? `New reply from ${author?.displayName ?? 'a teammate'}`
                        : `New reply in ${channelLabel}`
                    : channel.isDm
                        ? `New message from ${author?.displayName ?? 'a teammate'}`
                        : `New message in ${channelLabel}`,
                body: body.slice(0, 180),
                target: {
                    entityType: 'chat_message',
                    entityId: row.id,
                    url: `/app/${channel.workspaceId}/chat?channel=${data.channelId}&message=${row.id}`,
                },
                emailContext: { taskTitle: channelLabel, workspaceName: 'Workspace', commentSnippet: body.slice(0, 180) },
            });
        }
        // @Rundesk AI assistant (§7.6) — best-effort, fire-and-forget.
        void this.maybeAnswerAiMention({ id: channel.id, workspaceId: channel.workspaceId }, data.authorId, body);
        return enriched;
    }
    /**
     * Create a task from a chat message (Plan §6.10, §A3.5). Title defaults to the
     * message's first line; the full message becomes the description. An optional
     * assignee and due date turn it into a real action item rather than an
     * unowned, undated task nobody picks up.
     */
    async createTaskFromMessage(messageId, userId, listId, title, opts = {}) {
        const [message] = await this.db.select().from(db_1.chatMessages).where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId));
        if (!message)
            throw new common_1.NotFoundException('Message not found');
        await this.assertChannelAccess(message.channelId, userId);
        if (!listId)
            throw new common_1.ForbiddenException('listId is required');
        const firstLine = message.body.split('\n')[0].trim();
        const resolvedTitle = (title?.trim() || firstLine || 'Task from chat').slice(0, 200);
        let dueDate;
        if (opts.dueAt) {
            const parsed = new Date(opts.dueAt);
            if (Number.isNaN(parsed.getTime()))
                throw new common_1.BadRequestException('dueAt must be a valid date');
            dueDate = parsed;
        }
        const task = await this.tasks.createTask({
            listId,
            title: resolvedTitle,
            description: message.body,
            createdById: userId,
            assigneeIds: opts.assigneeId ? [opts.assigneeId] : undefined,
            dueDate,
        });
        return task;
    }
    /** First usable (non-archived) list in a workspace — the default target for a
     *  slash command's task/reminder. Null when the workspace has no list yet. */
    async resolveDefaultList(workspaceId) {
        const [row] = await this.db
            .select({ id: db_1.lists.id })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.lists.isArchived, false)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.lists.createdAt))
            .limit(1);
        return row?.id ?? null;
    }
    /**
     * Parse the "<when> <what>" tail of a `/remind` command into an absolute time
     * plus the reminder note (Plan §6.3). Understands a leading "me", relative
     * phrases ("in 20 minutes", "in 2 hours", "in 3 days", "tomorrow", "tonight")
     * and clock times ("at 3pm", "at 14:30"). Falls back to +1 hour when no time
     * phrase is recognised so the command always yields a real reminder.
     */
    parseReminderWhen(input, now = new Date()) {
        let rest = (input ?? '').trim().replace(/^me\b[\s,]*/i, '').trim();
        let when = null;
        let phrase = '';
        const rel = /^in\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d)\b/i.exec(rest);
        const at = /^at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(rest);
        if (rel) {
            const n = Number(rel[1]);
            const unit = rel[2].toLowerCase();
            const ms = /^h/.test(unit) ? n * 3_600_000 : /^d/.test(unit) ? n * 86_400_000 : n * 60_000;
            when = new Date(now.getTime() + ms);
            phrase = rel[0];
            rest = rest.slice(rel[0].length).trim();
        }
        else if (/^tomorrow\b/i.test(rest)) {
            const d = new Date(now.getTime() + 86_400_000);
            d.setHours(9, 0, 0, 0);
            when = d;
            phrase = 'tomorrow';
            rest = rest.replace(/^tomorrow\b/i, '').trim();
        }
        else if (/^tonight\b/i.test(rest)) {
            const d = new Date(now);
            d.setHours(20, 0, 0, 0);
            if (d.getTime() <= now.getTime())
                d.setTime(d.getTime() + 86_400_000);
            when = d;
            phrase = 'tonight';
            rest = rest.replace(/^tonight\b/i, '').trim();
        }
        else if (at) {
            let hour = Number(at[1]) % 24;
            const min = at[2] ? Number(at[2]) : 0;
            const mer = at[3]?.toLowerCase();
            if (mer === 'pm' && hour < 12)
                hour += 12;
            if (mer === 'am' && hour === 12)
                hour = 0;
            const d = new Date(now);
            d.setHours(hour, min, 0, 0);
            if (d.getTime() <= now.getTime())
                d.setTime(d.getTime() + 86_400_000); // next day if already past
            when = d;
            phrase = at[0];
            rest = rest.slice(at[0].length).trim();
        }
        if (!when) {
            when = new Date(now.getTime() + 3_600_000);
            phrase = 'in 1 hour';
        }
        // A leading "to " reads awkwardly as a task title ("to review the PR" → "review the PR").
        const note = rest.replace(/^to\s+/i, '').trim();
        return { when, note, phrase };
    }
    /**
     * Run a leading slash command from the composer (Plan §6.3). `/task <text>`
     * creates a task from the text; `/remind <when> <text>` schedules a reminder.
     * Either way a confirmation message is posted to the channel instead of the
     * literal command.
     */
    async runCommand(channelId, userId, command, text) {
        const channel = await this.assertChannelAccess(channelId, userId);
        const cmd = (command ?? '').trim().toLowerCase().replace(/^\//, '');
        const trimmed = (text ?? '').trim();
        if (cmd === 'task') {
            if (!trimmed)
                throw new common_1.BadRequestException('Usage: /task <description>');
            const listId = await this.resolveDefaultList(channel.workspaceId);
            if (!listId)
                throw new common_1.BadRequestException('No list is available to create a task in yet — create a space, project and list first.');
            const title = trimmed.split('\n')[0].slice(0, 200);
            const task = await this.tasks.createTask({ listId, title, description: trimmed, createdById: userId });
            const message = await this.postMessage({
                channelId,
                authorId: userId,
                body: `✅ **Task created:** ${title}`,
            });
            return { kind: 'task', task, message };
        }
        if (cmd === 'remind') {
            const { when, note, phrase } = this.parseReminderWhen(trimmed);
            if (!note)
                throw new common_1.BadRequestException('Usage: /remind <when> <what> (e.g. /remind in 2 hours review the PR)');
            const title = note.split('\n')[0].slice(0, 200);
            /*
             * §G11 [15:19] — no longer backed by an invented task.
             *
             * It used to create one to hold the text, because `reminders.task_id` was
             * NOT NULL. That put a phantom task in somebody's list for every
             * egg-timer they set, and refused outright in a workspace with no list —
             * an odd prerequisite for "remind me in two hours". The subject is
             * optional now, so the reminder simply carries its own note.
             */
            const reminder = await this.reminders.createStandalone(channel.workspaceId, userId, when, note);
            const message = await this.postMessage({
                channelId,
                authorId: userId,
                body: `⏰ **Reminder set** (${phrase}) — ${title}`,
            });
            return { kind: 'remind', reminder, message };
        }
        // §15 — a skill's slash command. ClickUp: "The /Slash Command for AI Skills
        // appears for everyone in the Workspace", which is the primary way a skill
        // is used: you type it where the work is, not from a settings page.
        //
        // Only skills this person has INSTALLED are reachable. Making every
        // published skill typable would grow the command namespace with the team,
        // collide constantly, and leave "Enabled" describing nothing.
        if (cmd && !(0, skill_slug_1.isReservedSlug)(cmd)) {
            const installed = await this.skills.listInstalled(channel.workspaceId, userId);
            const resolved = (0, skill_slug_1.resolveSlug)(cmd, installed);
            if (resolved.kind === 'ambiguous') {
                throw new common_1.BadRequestException(`/${cmd} matches more than one of your skills (${resolved.names.join(', ')}). Rename one of them.`);
            }
            if (resolved.kind === 'match') {
                if (!trimmed)
                    throw new common_1.BadRequestException(`Usage: /${cmd} <what you want>`);
                // Through SkillsService, so its visibility and enabled checks run on the
                // one path that builds a prompt — a disabled skill is refused here
                // exactly as it is in the AI panel.
                const invocation = await this.skills.buildInvocationContext(channel.workspaceId, userId, resolved.skill.id);
                const skillPrompt = this.skills.renderSkillPrompt(invocation);
                // The question goes in as the person's own message, so the channel
                // reads as a conversation rather than an answer to nothing.
                const asked = await this.postMessage({
                    channelId,
                    authorId: userId,
                    body: `/${cmd} ${trimmed}`,
                });
                const aiUserId = await this.ensureAiUser();
                await this.db
                    .insert(db_1.chatChannelMembers)
                    .values({ channelId: channel.id, userId: aiUserId })
                    .onConflictDoNothing();
                const context = await this.ai.buildWorkspaceContext(channel.workspaceId, userId);
                const answer = await this.ai.chatReply([{ role: 'user', content: trimmed }], context, { userId, workspaceId: channel.workspaceId }, skillPrompt);
                if (!answer)
                    throw new common_1.BadRequestException(`/${cmd} did not come back with an answer`);
                const [aiMsg] = await this.db
                    .insert(db_1.chatMessages)
                    .values({ channelId: channel.id, authorId: aiUserId, body: answer })
                    .returning();
                this.realtime.emitToWorkspace(channel.workspaceId, {
                    type: 'chat.message.created',
                    workspaceId: channel.workspaceId,
                    channelId: channel.id,
                    // Named as the skill, not "Rundesk AI": the whole point of invoking
                    // one is that this answer came from somewhere specific.
                    message: { ...aiMsg, authorName: invocation.skill.name, reactions: [] },
                });
                return { kind: 'skill', skill: resolved.skill, message: asked, reply: aiMsg };
            }
        }
        throw new common_1.BadRequestException(`Unknown command: /${cmd}`);
    }
    async editMessage(messageId, userId, body) {
        const [existing] = await this.db.select().from(db_1.chatMessages).where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId));
        if (!existing)
            throw new common_1.NotFoundException('Message not found');
        if (existing.deletedAt)
            throw new common_1.ForbiddenException('Cannot edit a deleted message');
        await this.assertChannelAccess(existing.channelId, userId);
        if (existing.authorId !== userId)
            throw new common_1.ForbiddenException('Not your message');
        const now = new Date();
        const trimmed = body.trim();
        // Preserve the prior version (Plan §6.3): snapshot the body being replaced
        // before overwriting it. Skip no-op edits so the history stays meaningful.
        if (trimmed !== existing.body) {
            await this.db
                .insert(db_1.chatMessageEdits)
                .values({ messageId, previousBody: existing.body, editedAt: now });
        }
        const [row] = await this.db
            .update(db_1.chatMessages)
            .set({ body: trimmed, editedAt: now })
            .where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId))
            .returning();
        const [channel] = await this.db.select().from(db_1.chatChannels).where((0, drizzle_orm_1.eq)(db_1.chatChannels.id, row.channelId));
        if (channel) {
            this.realtime.emitToWorkspace(channel.workspaceId, {
                type: 'chat.message.updated',
                workspaceId: channel.workspaceId,
                channelId: row.channelId,
                messageId,
                patch: { body: row.body, editedAt: row.editedAt },
            });
        }
        return row;
    }
    /**
     * The edit history of a message (Plan §6.3) — the prior bodies newest-first,
     * plus the message's current body as the live version. Channel-access gated.
     */
    async getMessageEdits(messageId, userId) {
        const [existing] = await this.db
            .select({ id: db_1.chatMessages.id, channelId: db_1.chatMessages.channelId, body: db_1.chatMessages.body, editedAt: db_1.chatMessages.editedAt })
            .from(db_1.chatMessages)
            .where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId))
            .limit(1);
        if (!existing)
            throw new common_1.NotFoundException('Message not found');
        await this.assertChannelAccess(existing.channelId, userId);
        const edits = await this.db
            .select({ id: db_1.chatMessageEdits.id, previousBody: db_1.chatMessageEdits.previousBody, editedAt: db_1.chatMessageEdits.editedAt })
            .from(db_1.chatMessageEdits)
            .where((0, drizzle_orm_1.eq)(db_1.chatMessageEdits.messageId, messageId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.chatMessageEdits.editedAt));
        return {
            messageId,
            current: { body: existing.body, editedAt: existing.editedAt },
            edits,
        };
    }
    // Pin / unpin a message for the whole channel (any channel member may pin).
    async setPinned(messageId, userId, pinned) {
        const [existing] = await this.db.select().from(db_1.chatMessages).where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId));
        if (!existing)
            throw new common_1.NotFoundException('Message not found');
        const channel = await this.assertChannelAccess(existing.channelId, userId);
        const [row] = await this.db
            .update(db_1.chatMessages)
            .set({ pinnedAt: pinned ? new Date() : null, pinnedById: pinned ? userId : null })
            .where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId))
            .returning();
        this.realtime.emitToWorkspace(channel.workspaceId, {
            type: 'chat.message.updated',
            workspaceId: channel.workspaceId,
            channelId: row.channelId,
            messageId,
            patch: { pinnedAt: row.pinnedAt, pinnedById: row.pinnedById },
        });
        return row;
    }
    // List a channel's pinned messages (newest pin first), with pinner attribution.
    async listPinned(channelId, userId) {
        await this.assertChannelAccess(channelId, userId);
        const rows = await this.db
            .select({
            id: db_1.chatMessages.id,
            channelId: db_1.chatMessages.channelId,
            authorId: db_1.chatMessages.authorId,
            body: db_1.chatMessages.body,
            mentions: db_1.chatMessages.mentions,
            editedAt: db_1.chatMessages.editedAt,
            pinnedAt: db_1.chatMessages.pinnedAt,
            pinnedById: db_1.chatMessages.pinnedById,
            createdAt: db_1.chatMessages.createdAt,
            authorName: db_1.users.displayName,
            authorAvatarUrl: db_1.users.avatarUrl,
        })
            .from(db_1.chatMessages)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatMessages.authorId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatMessages.channelId, channelId), (0, drizzle_orm_1.isNotNull)(db_1.chatMessages.pinnedAt), (0, drizzle_orm_1.isNull)(db_1.chatMessages.deletedAt)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.chatMessages.pinnedAt));
        // Attach the pinner's display name (Plan §6 pin attribution).
        const pinnerIds = [...new Set(rows.map((r) => r.pinnedById).filter((id) => !!id))];
        const pinnerNames = pinnerIds.length
            ? await this.db.select({ id: db_1.users.id, name: db_1.users.displayName }).from(db_1.users).where((0, drizzle_orm_1.inArray)(db_1.users.id, pinnerIds))
            : [];
        const nameById = new Map(pinnerNames.map((p) => [p.id, p.name]));
        return rows.map((r) => ({ ...r, pinnedByName: r.pinnedById ? nameById.get(r.pinnedById) ?? null : null }));
    }
    // Save / unsave a message for the current user only (private bookmark).
    // Optional tags (Plan §6.7) are stored on the save row when saving.
    async setSaved(messageId, userId, saved, tags) {
        const [existing] = await this.db.select().from(db_1.chatMessages).where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId));
        if (!existing)
            throw new common_1.NotFoundException('Message not found');
        await this.assertChannelAccess(existing.channelId, userId);
        if (saved) {
            const normalized = normalizeSaveTags(tags);
            await this.db
                .insert(db_1.chatMessageSaves)
                .values({ messageId, userId, tags: normalized })
                .onConflictDoUpdate({
                target: [db_1.chatMessageSaves.messageId, db_1.chatMessageSaves.userId],
                set: { tags: normalized },
            });
            return { messageId, saved, tags: normalized };
        }
        await this.db
            .delete(db_1.chatMessageSaves)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatMessageSaves.messageId, messageId), (0, drizzle_orm_1.eq)(db_1.chatMessageSaves.userId, userId)));
        return { messageId, saved };
    }
    /**
     * §G11 [15:36] — assign a message to somebody as an action item.
     *
     * "aap us ko ASSIGN bhi kar sakte ho." Deliberately *not* a task: creating a
     * task is a different button that already works, and it moves the work away
     * from the conversation that explains it. This asks one person about one line
     * and leaves both where they are.
     *
     * The assignee must be able to read the channel. Assigning a private
     * conversation to somebody who is not in it would notify them with a body
     * quote and a link they cannot open — a leak with a "you can't see this"
     * screen at the end of it.
     */
    async assignMessage(messageId, actorId, assigneeId, dueAt) {
        if (!assigneeId)
            throw new common_1.BadRequestException('assigneeId is required');
        const [message] = await this.db.select().from(db_1.chatMessages).where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId));
        if (!message)
            throw new common_1.NotFoundException('Message not found');
        const channel = await this.assertChannelAccess(message.channelId, actorId);
        await this.assertChannelAccess(message.channelId, assigneeId).catch(() => {
            throw new common_1.BadRequestException('That person cannot see this conversation');
        });
        let due = null;
        if (dueAt) {
            due = dueAt instanceof Date ? dueAt : new Date(dueAt);
            if (Number.isNaN(due.getTime()))
                throw new common_1.BadRequestException('dueAt must be a valid date');
        }
        // Pressing Assign on somebody who already has it re-opens it and updates
        // the date, rather than failing on the unique index. "Assign again" is what
        // a person means by pressing it twice, and it is also how a due date is
        // changed without an edit control of its own.
        const [row] = await this.db
            .insert(db_1.chatMessageAssignments)
            .values({ messageId, assigneeId, assignedById: actorId, dueAt: due })
            .onConflictDoUpdate({
            target: [db_1.chatMessageAssignments.messageId, db_1.chatMessageAssignments.assigneeId],
            set: { dueAt: due, assignedById: actorId, resolvedAt: null, resolvedById: null },
        })
            .returning();
        const [assignee] = await this.db
            .select({ displayName: db_1.users.displayName, avatarUrl: db_1.users.avatarUrl })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, assigneeId));
        const [actor] = await this.db
            .select({ displayName: db_1.users.displayName })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, actorId));
        // Assigning yourself something is a note to self, not a notification.
        if (assigneeId !== actorId) {
            void this.notifications.create({
                userId: assigneeId,
                workspaceId: channel.workspaceId,
                actorId,
                type: 'message_assigned',
                title: `${actor?.displayName ?? 'A teammate'} assigned you a message in ${channel.isDm ? 'a direct message' : `#${channel.name}`}`,
                body: message.body.slice(0, 180),
                target: {
                    entityType: 'chat_message',
                    entityId: message.id,
                    url: `/app/${channel.workspaceId}/chat?channel=${message.channelId}&message=${message.id}`,
                },
                emailContext: { taskTitle: `#${channel.name}`, commentSnippet: message.body.slice(0, 180) },
            });
        }
        // Everyone in the channel sees the badge appear without a refetch.
        this.realtime.emitToWorkspace(channel.workspaceId, {
            type: 'chat.message.assigned',
            workspaceId: channel.workspaceId,
            channelId: message.channelId,
            messageId: message.id,
        });
        return {
            ...row,
            assigneeName: assignee?.displayName ?? null,
            assigneeAvatarUrl: assignee?.avatarUrl ?? null,
        };
    }
    /** Take an assignment back off somebody. Idempotent. */
    async unassignMessage(messageId, actorId, assigneeId) {
        const [message] = await this.db.select().from(db_1.chatMessages).where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId));
        if (!message)
            throw new common_1.NotFoundException('Message not found');
        const channel = await this.assertChannelAccess(message.channelId, actorId);
        await this.db
            .delete(db_1.chatMessageAssignments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatMessageAssignments.messageId, messageId), (0, drizzle_orm_1.eq)(db_1.chatMessageAssignments.assigneeId, assigneeId)));
        this.realtime.emitToWorkspace(channel.workspaceId, {
            type: 'chat.message.assigned',
            workspaceId: channel.workspaceId,
            channelId: message.channelId,
            messageId: message.id,
        });
        return { messageId, assigneeId, assigned: false };
    }
    /**
     * Mark an assignment done, or re-open it.
     *
     * Resolving stamps rather than deletes: "I did that" and "that was never
     * mine" are different answers, and an assignment that disappears on
     * completion takes the record of who did it with it. Either the assignee or
     * whoever asked can resolve — the assigner watching it land is as common as
     * the assignee reporting it.
     */
    async resolveMessageAssignment(messageId, actorId, assigneeId, resolved) {
        const [message] = await this.db.select().from(db_1.chatMessages).where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId));
        if (!message)
            throw new common_1.NotFoundException('Message not found');
        const channel = await this.assertChannelAccess(message.channelId, actorId);
        const [row] = await this.db
            .update(db_1.chatMessageAssignments)
            .set(resolved
            ? { resolvedAt: new Date(), resolvedById: actorId }
            : { resolvedAt: null, resolvedById: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatMessageAssignments.messageId, messageId), (0, drizzle_orm_1.eq)(db_1.chatMessageAssignments.assigneeId, assigneeId)))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Assignment not found');
        this.realtime.emitToWorkspace(channel.workspaceId, {
            type: 'chat.message.assigned',
            workspaceId: channel.workspaceId,
            channelId: message.channelId,
            messageId: message.id,
        });
        return row;
    }
    /**
     * Everything still assigned to the caller in this workspace, oldest first.
     *
     * Oldest first on purpose: an action item nobody has picked up in a week is
     * the one worth surfacing, and newest-first buries exactly that row.
     */
    async listMyAssignments(workspaceId, userId) {
        return this.db
            .select({
            id: db_1.chatMessageAssignments.id,
            messageId: db_1.chatMessageAssignments.messageId,
            channelId: db_1.chatMessages.channelId,
            channelName: db_1.chatChannels.name,
            isDm: db_1.chatChannels.isDm,
            body: db_1.chatMessages.body,
            authorId: db_1.chatMessages.authorId,
            authorName: db_1.users.displayName,
            assignedById: db_1.chatMessageAssignments.assignedById,
            dueAt: db_1.chatMessageAssignments.dueAt,
            resolvedAt: db_1.chatMessageAssignments.resolvedAt,
            createdAt: db_1.chatMessageAssignments.createdAt,
        })
            .from(db_1.chatMessageAssignments)
            .innerJoin(db_1.chatMessages, (0, drizzle_orm_1.eq)(db_1.chatMessages.id, db_1.chatMessageAssignments.messageId))
            .innerJoin(db_1.chatChannels, (0, drizzle_orm_1.eq)(db_1.chatChannels.id, db_1.chatMessages.channelId))
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatMessages.authorId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatMessageAssignments.assigneeId, userId), (0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.isNull)(db_1.chatMessageAssignments.resolvedAt)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.chatMessageAssignments.createdAt));
    }
    /**
     * §G12 [17:13] — follow or mute one thread.
     *
     * Three states, and `null` is one of them: not having said is different from
     * having said "normal", because what "normal" means depends on whether you
     * ever replied. Clearing the row puts you back on the default rather than
     * freezing today's answer to it.
     */
    async setThreadFollow(parentMessageId, userId, state) {
        const [message] = await this.db.select().from(db_1.chatMessages).where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, parentMessageId));
        if (!message)
            throw new common_1.NotFoundException('Message not found');
        await this.assertChannelAccess(message.channelId, userId);
        // A thread is named by its root. Muting a reply means muting its thread,
        // which is what somebody right-clicking the reply meant.
        const rootId = message.parentMessageId ?? message.id;
        if (state === null) {
            await this.db
                .delete(db_1.chatThreadFollows)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatThreadFollows.parentMessageId, rootId), (0, drizzle_orm_1.eq)(db_1.chatThreadFollows.userId, userId)));
            return { parentMessageId: rootId, state: null };
        }
        if (state !== 'following' && state !== 'muted') {
            throw new common_1.BadRequestException("state must be 'following', 'muted' or null");
        }
        await this.db
            .insert(db_1.chatThreadFollows)
            .values({ parentMessageId: rootId, userId, state })
            .onConflictDoUpdate({
            target: [db_1.chatThreadFollows.parentMessageId, db_1.chatThreadFollows.userId],
            set: { state },
        });
        return { parentMessageId: rootId, state };
    }
    /** The caller's stance on one thread: 'following' | 'muted' | null. */
    async getThreadFollow(parentMessageId, userId) {
        const [message] = await this.db
            .select({ id: db_1.chatMessages.id, channelId: db_1.chatMessages.channelId, parentMessageId: db_1.chatMessages.parentMessageId })
            .from(db_1.chatMessages)
            .where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, parentMessageId));
        if (!message)
            throw new common_1.NotFoundException('Message not found');
        await this.assertChannelAccess(message.channelId, userId);
        const rootId = message.parentMessageId ?? message.id;
        const [row] = await this.db
            .select({ state: db_1.chatThreadFollows.state })
            .from(db_1.chatThreadFollows)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatThreadFollows.parentMessageId, rootId), (0, drizzle_orm_1.eq)(db_1.chatThreadFollows.userId, userId)))
            .limit(1);
        return { parentMessageId: rootId, state: row?.state ?? null };
    }
    /**
     * §G11 [15:19] — "Set reminder" on a saved message.
     *
     * The reminder points at the message, so the notification lands you back on
     * the line you wanted to remember rather than on a task invented to hold it.
     */
    async remindAboutMessage(messageId, userId, remindAt, note) {
        const [message] = await this.db.select().from(db_1.chatMessages).where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId));
        if (!message)
            throw new common_1.NotFoundException('Message not found');
        const channel = await this.assertChannelAccess(message.channelId, userId);
        return this.reminders.createForMessage(channel.workspaceId, userId, messageId, remindAt, note);
    }
    /** Replace the tags on an already-saved message (Plan §6.7). */
    async updateSavedTags(messageId, userId, tags) {
        const normalized = normalizeSaveTags(tags);
        const [row] = await this.db
            .update(db_1.chatMessageSaves)
            .set({ tags: normalized })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatMessageSaves.messageId, messageId), (0, drizzle_orm_1.eq)(db_1.chatMessageSaves.userId, userId)))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Saved message not found');
        return { messageId, tags: normalized };
    }
    // List the current user's saved messages across a workspace (newest first),
    // optionally filtered by a tag and/or a free-text query over the body (§6.7).
    async listSaved(workspaceId, userId, opts = {}) {
        const conditions = [(0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.chatMessageSaves.userId, userId)];
        const tag = opts.tag?.trim().toLowerCase();
        if (tag)
            conditions.push((0, drizzle_orm_1.sql) `${db_1.chatMessageSaves.tags} @> ARRAY[${tag}]::text[]`);
        const q = opts.q?.trim();
        if (q)
            conditions.push((0, drizzle_orm_1.ilike)(db_1.chatMessages.body, `%${q}%`));
        return this.db
            .select({
            id: db_1.chatMessages.id,
            channelId: db_1.chatMessages.channelId,
            channelName: db_1.chatChannels.name,
            authorId: db_1.chatMessages.authorId,
            body: db_1.chatMessages.body,
            mentions: db_1.chatMessages.mentions,
            editedAt: db_1.chatMessages.editedAt,
            pinnedAt: db_1.chatMessages.pinnedAt,
            createdAt: db_1.chatMessages.createdAt,
            savedAt: db_1.chatMessageSaves.createdAt,
            tags: db_1.chatMessageSaves.tags,
            authorName: db_1.users.displayName,
            authorAvatarUrl: db_1.users.avatarUrl,
        })
            .from(db_1.chatMessageSaves)
            .innerJoin(db_1.chatMessages, (0, drizzle_orm_1.eq)(db_1.chatMessages.id, db_1.chatMessageSaves.messageId))
            .innerJoin(db_1.chatChannels, (0, drizzle_orm_1.eq)(db_1.chatChannels.id, db_1.chatMessages.channelId))
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatMessages.authorId))
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(db_1.chatMessageSaves.createdAt));
    }
    /**
     * Channel ids in a workspace the requester can actually read (Plan §6.8/§6.11).
     * A bulk equivalent of assertChannelAccess used to scope the file library and
     * message search: excludes channels in a private space the user isn't a member
     * of, and private / DM channels they haven't joined. Archived channels are left
     * out so a search hit always deep-links to a channel still shown in the sidebar.
     */
    async accessibleChannelIds(workspaceId, userId) {
        const channels = await this.db
            .select({
            id: db_1.chatChannels.id,
            spaceId: db_1.chatChannels.spaceId,
            isPrivate: db_1.chatChannels.isPrivate,
            isDm: db_1.chatChannels.isDm,
        })
            .from(db_1.chatChannels)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.isNull)(db_1.chatChannels.archivedAt)));
        if (channels.length === 0)
            return [];
        const memberships = await this.db
            .select({ channelId: db_1.chatChannelMembers.channelId })
            .from(db_1.chatChannelMembers)
            .where((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.userId, userId));
        const memberSet = new Set(memberships.map((m) => m.channelId));
        // Private spaces the user is NOT a member of block every channel scoped to them.
        const blockedSpaceIds = new Set();
        const spaceIds = [...new Set(channels.map((c) => c.spaceId).filter((id) => !!id))];
        if (spaceIds.length > 0) {
            const spaceRows = await this.db
                .select({ id: db_1.spaces.id, visibility: db_1.spaces.visibility })
                .from(db_1.spaces)
                .where((0, drizzle_orm_1.inArray)(db_1.spaces.id, spaceIds));
            const privateSpaceIds = spaceRows.filter((s) => s.visibility === 'private').map((s) => s.id);
            if (privateSpaceIds.length > 0) {
                const mine = await this.db
                    .select({ spaceId: db_1.spaceMembers.spaceId })
                    .from(db_1.spaceMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, userId), (0, drizzle_orm_1.inArray)(db_1.spaceMembers.spaceId, privateSpaceIds)));
                const mineSet = new Set(mine.map((m) => m.spaceId));
                for (const id of privateSpaceIds)
                    if (!mineSet.has(id))
                        blockedSpaceIds.add(id);
            }
        }
        return channels
            .filter((c) => {
            if (c.spaceId && blockedSpaceIds.has(c.spaceId))
                return false;
            if ((c.isPrivate || c.isDm) && !memberSet.has(c.id))
                return false;
            return true;
        })
            .map((c) => c.id);
    }
    /** Escape LIKE wildcards so a user's query is matched literally. */
    escapeLike(input) {
        return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    }
    /**
     * Translate a coarse file-type filter (Plan §6.8/§6.11) into a content-type
     * ILIKE pattern. 'image' | 'video' | 'audio' → the MIME top-level; 'pdf' → any
     * pdf; anything else is a literal content-type substring. Null means "no type
     * constraint" (empty / any / all).
     */
    contentTypePattern(type) {
        const t = (type ?? '').trim().toLowerCase();
        if (!t || t === 'any' || t === 'all')
            return null;
        if (t === 'image' || t === 'video' || t === 'audio')
            return `${t}/%`;
        if (t === 'pdf')
            return '%pdf%';
        return `%${this.escapeLike(t)}%`;
    }
    /**
     * Workspace file library (Plan §6.8): every attachment posted in a channel the
     * user can read, newest first, with a fresh signed download URL. Optional
     * filename search (`q`), coarse content-type filter (`type`) and channel scope
     * (`channelId`, §A3.7 — the panel opens on the channel you're reading).
     * Attachments on unsent drafts (message_id null) or deleted messages are
     * excluded.
     */
    async listWorkspaceFiles(workspaceId, userId, opts = {}) {
        let channelIds = await this.accessibleChannelIds(workspaceId, userId);
        if (opts.channelId)
            channelIds = channelIds.filter((id) => id === opts.channelId);
        if (channelIds.length === 0)
            return [];
        const conds = [
            (0, drizzle_orm_1.inArray)(db_1.chatMessageAttachments.channelId, channelIds),
            (0, drizzle_orm_1.isNotNull)(db_1.chatMessageAttachments.messageId),
            (0, drizzle_orm_1.isNull)(db_1.chatMessages.deletedAt),
        ];
        const q = (opts.q ?? '').trim();
        if (q)
            conds.push((0, drizzle_orm_1.ilike)(db_1.chatMessageAttachments.fileName, `%${this.escapeLike(q)}%`));
        const typePattern = this.contentTypePattern(opts.type);
        if (typePattern)
            conds.push((0, drizzle_orm_1.ilike)(db_1.chatMessageAttachments.contentType, typePattern));
        const rows = await this.db
            .select({
            id: db_1.chatMessageAttachments.id,
            fileName: db_1.chatMessageAttachments.fileName,
            contentType: db_1.chatMessageAttachments.contentType,
            sizeBytes: db_1.chatMessageAttachments.sizeBytes,
            storageKey: db_1.chatMessageAttachments.storageKey,
            createdAt: db_1.chatMessageAttachments.createdAt,
            channelId: db_1.chatMessageAttachments.channelId,
            channelName: db_1.chatChannels.name,
            messageId: db_1.chatMessageAttachments.messageId,
            uploadedById: db_1.chatMessageAttachments.uploadedById,
            uploaderName: db_1.users.displayName,
        })
            .from(db_1.chatMessageAttachments)
            .innerJoin(db_1.chatMessages, (0, drizzle_orm_1.eq)(db_1.chatMessages.id, db_1.chatMessageAttachments.messageId))
            .innerJoin(db_1.chatChannels, (0, drizzle_orm_1.eq)(db_1.chatChannels.id, db_1.chatMessageAttachments.channelId))
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatMessageAttachments.uploadedById))
            .where((0, drizzle_orm_1.and)(...conds))
            .orderBy((0, drizzle_orm_1.desc)(db_1.chatMessageAttachments.createdAt))
            .limit(200);
        return Promise.all(rows.map(async (r) => ({
            id: r.id,
            fileName: r.fileName,
            contentType: r.contentType,
            sizeBytes: r.sizeBytes,
            channelId: r.channelId,
            channelName: r.channelName,
            messageId: r.messageId,
            uploadedById: r.uploadedById,
            uploaderName: r.uploaderName ?? null,
            createdAt: r.createdAt,
            url: this.r2.configured ? await this.r2.getObjectUrl(r.storageKey) : r.storageKey,
        })));
    }
    /**
     * Full message search across the workspace (Plan §6.11). Searches message
     * bodies (thread replies included) in every channel the user can read, with
     * optional channel / sender / date-range / has-file(type) filters. Each hit
     * carries channelId + messageId so the client can deep-link + highlight.
     */
    async searchMessages(workspaceId, userId, opts = {}) {
        let channelIds = await this.accessibleChannelIds(workspaceId, userId);
        if (opts.channelId)
            channelIds = channelIds.filter((id) => id === opts.channelId);
        if (channelIds.length === 0)
            return [];
        const conds = [(0, drizzle_orm_1.inArray)(db_1.chatMessages.channelId, channelIds), (0, drizzle_orm_1.isNull)(db_1.chatMessages.deletedAt)];
        const q = (opts.q ?? '').trim();
        if (q)
            conds.push((0, drizzle_orm_1.ilike)(db_1.chatMessages.body, `%${this.escapeLike(q)}%`));
        if (opts.senderId)
            conds.push((0, drizzle_orm_1.eq)(db_1.chatMessages.authorId, opts.senderId));
        const after = opts.after ? new Date(opts.after) : null;
        if (after && !Number.isNaN(after.getTime()))
            conds.push((0, drizzle_orm_1.gt)(db_1.chatMessages.createdAt, after));
        const before = opts.before ? new Date(opts.before) : null;
        if (before && !Number.isNaN(before.getTime()))
            conds.push((0, drizzle_orm_1.lt)(db_1.chatMessages.createdAt, before));
        // has-file(type): correlated EXISTS so a message matches when it carries at
        // least one attachment (optionally of the requested content-type family).
        const fileType = (opts.fileType ?? '').trim().toLowerCase();
        if (fileType) {
            const filePattern = this.contentTypePattern(opts.fileType);
            const typeFrag = filePattern ? (0, drizzle_orm_1.sql) ` and cma.content_type ilike ${filePattern}` : (0, drizzle_orm_1.sql) ``;
            conds.push((0, drizzle_orm_1.sql) `exists (select 1 from chat_message_attachments cma where cma.message_id = ${db_1.chatMessages.id}${typeFrag})`);
        }
        return this.db
            .select({
            id: db_1.chatMessages.id,
            channelId: db_1.chatMessages.channelId,
            channelName: db_1.chatChannels.name,
            parentMessageId: db_1.chatMessages.parentMessageId,
            authorId: db_1.chatMessages.authorId,
            authorName: db_1.users.displayName,
            body: db_1.chatMessages.body,
            createdAt: db_1.chatMessages.createdAt,
        })
            .from(db_1.chatMessages)
            .innerJoin(db_1.chatChannels, (0, drizzle_orm_1.eq)(db_1.chatChannels.id, db_1.chatMessages.channelId))
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.chatMessages.authorId))
            .where((0, drizzle_orm_1.and)(...conds))
            .orderBy((0, drizzle_orm_1.desc)(db_1.chatMessages.createdAt))
            .limit(50);
    }
    /** Channel creator or a workspace admin/super_admin may moderate (Plan §6). */
    async canModerateChannel(channel, userId) {
        if (channel.createdById === userId)
            return true;
        const [m] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, channel.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        return m?.role === 'workspace_admin' || m?.role === 'super_admin';
    }
    async deleteMessage(messageId, userId) {
        const [existing] = await this.db.select().from(db_1.chatMessages).where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId));
        if (!existing)
            throw new common_1.NotFoundException('Message not found');
        const channel = await this.assertChannelAccess(existing.channelId, userId);
        if (existing.authorId !== userId && !(await this.canModerateChannel(channel, userId))) {
            throw new common_1.ForbiddenException('Only the author or a channel/workspace admin can delete this message');
        }
        // Soft-delete tombstone: keep the row (threads/pins), blank the body, unpin.
        const [row] = await this.db
            .update(db_1.chatMessages)
            .set({ deletedAt: new Date(), body: '', pinnedAt: null, pinnedById: null })
            .where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId))
            .returning();
        this.realtime.emitToWorkspace(channel.workspaceId, {
            type: 'chat.message.updated',
            workspaceId: channel.workspaceId,
            channelId: existing.channelId,
            messageId,
            patch: { deletedAt: row.deletedAt, body: '', pinnedAt: null },
        });
        return { ok: true };
    }
    async toggleReaction(messageId, userId, emoji) {
        const [message] = await this.db.select().from(db_1.chatMessages).where((0, drizzle_orm_1.eq)(db_1.chatMessages.id, messageId));
        if (!message)
            throw new common_1.NotFoundException('Message not found');
        await this.assertChannelAccess(message.channelId, userId);
        const [channel] = message
            ? await this.db.select().from(db_1.chatChannels).where((0, drizzle_orm_1.eq)(db_1.chatChannels.id, message.channelId))
            : [];
        const [existing] = await this.db
            .select()
            .from(db_1.chatMessageReactions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatMessageReactions.messageId, messageId), (0, drizzle_orm_1.eq)(db_1.chatMessageReactions.userId, userId), (0, drizzle_orm_1.eq)(db_1.chatMessageReactions.emoji, emoji)));
        if (existing) {
            await this.db.delete(db_1.chatMessageReactions).where((0, drizzle_orm_1.eq)(db_1.chatMessageReactions.id, existing.id));
            if (channel && message) {
                this.realtime.emitToWorkspace(channel.workspaceId, {
                    type: 'chat.reaction.toggled',
                    workspaceId: channel.workspaceId,
                    channelId: message.channelId,
                    messageId,
                });
            }
            return { ok: true, removed: true };
        }
        await this.db.insert(db_1.chatMessageReactions).values({ messageId, userId, emoji });
        if (channel && message) {
            this.realtime.emitToWorkspace(channel.workspaceId, {
                type: 'chat.reaction.toggled',
                workspaceId: channel.workspaceId,
                channelId: message.channelId,
                messageId,
            });
            // §2.2 — one of the kinds she went through in the Primary customiser.
            // She turns it off for herself ("neeche se REACTIONS mujhe na show hon"),
            // which is a choice the picker can only offer if the type exists.
            // Reacting to your own message tells you nothing.
            if (message.authorId && message.authorId !== userId) {
                await this.notifications
                    .create({
                    userId: message.authorId,
                    workspaceId: channel.workspaceId,
                    actorId: userId,
                    type: 'message_reaction',
                    title: emoji,
                    body: message.body ?? undefined,
                    target: { entityType: 'chat_message', entityId: messageId },
                })
                    .catch(() => undefined);
            }
        }
        return { ok: true, added: true };
    }
    async ensureGeneralChannel(workspaceId, userId) {
        const existing = await this.db
            .select()
            .from(db_1.chatChannels)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.chatChannels.name, 'general')));
        if (existing.length > 0)
            return existing[0];
        return this.createChannel({ workspaceId, name: 'general', createdById: userId });
    }
    /**
     * Fetch Open-Graph / Twitter-card metadata for a pasted link so the client can
     * render an inline preview (Plan §6.3). SSRF-hardened and best-effort: any
     * disallowed URL, timeout, or fetch error resolves to `{}` — we never throw to
     * the client and never surface an internal error. Results (including empty
     * ones, to avoid hammering a bad URL) are cached briefly in memory.
     */
    async unfurl(rawUrl) {
        const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
        if (!url)
            return {};
        const now = Date.now();
        const hit = this.unfurlCache.get(url);
        if (hit && now - hit.at < UNFURL_CACHE_TTL_MS)
            return hit.value;
        let value;
        try {
            value = await (0, link_unfurl_1.fetchLinkPreview)(url);
        }
        catch {
            value = {};
        }
        // Cheap size bound: clear when the map grows past the cap rather than track LRU.
        if (this.unfurlCache.size >= UNFURL_CACHE_MAX_ENTRIES)
            this.unfurlCache.clear();
        this.unfurlCache.set(url, { at: now, value });
        return value;
    }
};
exports.ChatService = ChatService;
exports.ChatService = ChatService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, realtime_gateway_1.RealtimeGateway,
        notifications_service_1.NotificationsService,
        tasks_service_1.TasksService,
        ai_service_1.AiService,
        r2_service_1.R2Service,
        task_reminders_service_1.TaskRemindersService,
        presence_service_1.PresenceService,
        shares_service_1.SharesService,
        skills_service_1.SkillsService])
], ChatService);
//# sourceMappingURL=chat.service.js.map