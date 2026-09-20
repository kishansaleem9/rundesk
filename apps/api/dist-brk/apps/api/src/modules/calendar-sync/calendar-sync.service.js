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
exports.CalendarSyncService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const item_visibility_1 = require("../../common/permissions/item-visibility");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const SYNC_TARGET_CALENDAR = 'primary';
let CalendarSyncService = class CalendarSyncService {
    constructor(db) {
        this.db = db;
    }
    // ─── outbound: rundesk -> calendar ────────────────────────────────────────
    /**
     * Push a single task to every connected calendar in its workspace.
     * Best-effort: failures are swallowed so a flaky calendar API doesn't
     * fail the user's task update.
     */
    async pushTask(taskId, expectedWorkspaceId) {
        const ctx = await this.resolveTaskContext(taskId);
        if (!ctx)
            return { pushed: [], skipped: ['task-not-found'] };
        // When called from an HTTP route, ensure the task actually belongs to the
        // caller's workspace (the route only proves membership of :workspaceId).
        if (expectedWorkspaceId && ctx.task.workspaceId !== expectedWorkspaceId) {
            return { pushed: [], skipped: ['task-not-in-workspace'] };
        }
        const pushed = [];
        const skipped = [];
        if (!ctx.task.dueDate || ctx.task.isArchived) {
            await this.deleteEverywhere(taskId);
            skipped.push('no-due-date-or-archived');
            return { pushed, skipped };
        }
        for (const conn of ctx.connections) {
            try {
                if (conn.provider === 'gcal') {
                    await this.upsertGoogleEvent(conn, ctx.task);
                    pushed.push('gcal');
                }
                else if (conn.provider === 'outlook') {
                    await this.upsertOutlookEvent(conn, ctx.task);
                    pushed.push('outlook');
                }
            }
            catch (err) {
                skipped.push(`${conn.provider}:${err.message}`);
            }
        }
        return { pushed, skipped };
    }
    /**
     * Remove this task's event from every connected calendar — called when
     * the task is archived/deleted or the dueDate is cleared.
     */
    async deleteEverywhere(taskId) {
        const links = await this.db
            .select()
            .from(db_1.taskCalendarLinks)
            .where((0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.taskId, taskId));
        if (links.length === 0)
            return;
        const connections = await this.loadConnectionsByIds([...new Set(links.map((l) => l.workspaceId))]);
        for (const link of links) {
            const conn = connections.find((c) => c.workspaceId === link.workspaceId && c.provider === link.provider);
            if (!conn)
                continue;
            try {
                if (conn.provider === 'gcal') {
                    await this.deleteGoogleEvent(conn, link.externalCalendarId, link.externalEventId);
                }
                else if (conn.provider === 'outlook') {
                    await this.deleteOutlookEvent(conn, link.externalEventId);
                }
            }
            catch {
                // ignore — event may already be gone on the calendar side
            }
        }
        await this.db.delete(db_1.taskCalendarLinks).where((0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.taskId, taskId));
    }
    // ─── inbound: calendar -> rundesk ─────────────────────────────────────────
    /**
     * Pull recent events from a workspace's connected calendar and either
     * update the linked task (if we've seen this event before) or insert
     * a new task in the configured inbox list. Returns counts so the UI
     * can render a "synced N tasks" toast.
     */
    async pullEvents(workspaceId, provider) {
        const conn = await this.requireConnection(workspaceId, provider);
        const inboxListId = conn.metadata?.inboxListId;
        if (!inboxListId) {
            throw new common_1.BadRequestException(`No inbox list configured for ${provider}. Set metadata.inboxListId on the connection first.`);
        }
        const events = provider === 'gcal'
            ? await this.listGoogleEvents(conn)
            : await this.listOutlookEvents(conn);
        let created = 0;
        let updated = 0;
        let skipped = 0;
        for (const event of events) {
            const [existing] = await this.db
                .select()
                .from(db_1.taskCalendarLinks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.provider, provider), (0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.externalEventId, event.id)))
                .limit(1);
            if (existing) {
                if (existing.etag === event.etag) {
                    skipped += 1;
                    continue;
                }
                await this.db
                    .update(db_1.tasks)
                    .set({
                    title: event.summary,
                    description: event.description ?? null,
                    dueDate: event.end,
                    startDate: event.start,
                    updatedAt: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(db_1.tasks.id, existing.taskId));
                await this.db
                    .update(db_1.taskCalendarLinks)
                    .set({ etag: event.etag ?? null, lastSyncedAt: new Date(), updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.id, existing.id));
                updated += 1;
            }
            else {
                const [task] = await this.db
                    .insert(db_1.tasks)
                    .values({
                    listId: inboxListId,
                    title: event.summary,
                    description: event.description ?? null,
                    startDate: event.start,
                    dueDate: event.end,
                    createdById: conn.connectedById ?? null,
                })
                    .returning();
                await this.db.insert(db_1.taskCalendarLinks).values({
                    taskId: task.id,
                    userId: conn.connectedById ?? task.createdById,
                    workspaceId,
                    provider,
                    externalCalendarId: SYNC_TARGET_CALENDAR,
                    externalEventId: event.id,
                    etag: event.etag ?? null,
                });
                created += 1;
            }
        }
        return { created, updated, skipped };
    }
    // ─── iCal feed ────────────────────────────────────────────────────────────
    /**
     * Mint (or rotate) a personal iCal subscription token for a user in a
     * workspace. The returned token is the secret half of the public feed
     * URL `/ical/{token}.ics`.
     */
    /**
     * Return the user's existing (non-revoked) iCal token without rotating it,
     * minting one only if none exists. Used for read/display so opening the
     * dialog doesn't invalidate already-distributed subscription URLs.
     */
    async getOrCreateIcalToken(userId, workspaceId) {
        const [existing] = await this.db
            .select()
            .from(db_1.userIcalTokens)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userIcalTokens.userId, userId), (0, drizzle_orm_1.eq)(db_1.userIcalTokens.workspaceId, workspaceId)))
            .limit(1);
        if (existing && !existing.revokedAt) {
            const base = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001';
            return { token: existing.token, url: `${base}/ical/${existing.token}.ics` };
        }
        return this.mintIcalToken(userId, workspaceId);
    }
    async mintIcalToken(userId, workspaceId) {
        const token = `ical_${(0, node_crypto_1.randomBytes)(24).toString('base64url')}`;
        await this.db
            .insert(db_1.userIcalTokens)
            .values({ userId, workspaceId, token })
            .onConflictDoUpdate({
            target: [db_1.userIcalTokens.userId, db_1.userIcalTokens.workspaceId],
            set: { token, revokedAt: null, createdAt: new Date() },
        });
        const base = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001';
        return { token, url: `${base}/ical/${token}.ics` };
    }
    async revokeIcalToken(userId, workspaceId) {
        await this.db
            .update(db_1.userIcalTokens)
            .set({ revokedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userIcalTokens.userId, userId), (0, drizzle_orm_1.eq)(db_1.userIcalTokens.workspaceId, workspaceId)));
    }
    /**
     * Look up the iCal token + return the user/workspace it points at. Used
     * by the public feed endpoint to authorise the request without a JWT.
     */
    async resolveIcalToken(token) {
        const [row] = await this.db
            .select()
            .from(db_1.userIcalTokens)
            .where((0, drizzle_orm_1.eq)(db_1.userIcalTokens.token, token))
            .limit(1);
        if (!row || row.revokedAt)
            return null;
        // Best-effort lastUsedAt; failure here doesn't block the feed.
        void this.db
            .update(db_1.userIcalTokens)
            .set({ lastUsedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.userIcalTokens.id, row.id))
            .catch(() => undefined);
        return { userId: row.userId, workspaceId: row.workspaceId };
    }
    /**
     * Build an RFC 5545 VCALENDAR document for every task in the workspace
     * the user has access to. Any client that supports iCalendar subscriptions
     * (Outlook, Apple Calendar, Google, Fantastical) will refresh this on
     * its own cadence — usually 1-24 hours.
     */
    async buildIcalFeed(userId, workspaceId) {
        // §2 per-item privacy: the token identifies one user — only surface private
        // tasks they may see (creator/assignee/manager); exclude everyone else's.
        const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, userId);
        const visFilter = (0, item_visibility_1.taskVisibilityFilter)(this.db, userId, isManager);
        const rows = await this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            description: db_1.tasks.description,
            startDate: db_1.tasks.startDate,
            dueDate: db_1.tasks.dueDate,
            updatedAt: db_1.tasks.updatedAt,
            status: db_1.tasks.status,
            listId: db_1.tasks.listId,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .leftJoin(db_1.taskAssignees, (0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, db_1.tasks.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.isNotNull)(db_1.tasks.dueDate), visFilter));
        // Tasks can appear multiple times due to the assignee left join; dedupe.
        const seen = new Set();
        const events = [];
        for (const row of rows) {
            if (seen.has(row.id))
                continue;
            seen.add(row.id);
            if (!row.dueDate)
                continue;
            events.push(this.formatVEvent(row, workspaceId));
        }
        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Rundesk//ICAL Subscription//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            `X-WR-CALNAME:Rundesk · ${workspaceId.slice(0, 8)}`,
            'X-WR-TIMEZONE:UTC',
            ...events,
            'END:VCALENDAR',
        ];
        return lines.join('\r\n');
    }
    formatVEvent(row, workspaceId) {
        const start = row.startDate ?? row.dueDate;
        const end = row.dueDate;
        const wrap = (key, value) => `${key}:${this.escapeIcsText(value)}`;
        return [
            'BEGIN:VEVENT',
            `UID:task-${row.id}@rundesk`,
            `DTSTAMP:${this.formatIcsDate(row.updatedAt)}`,
            `DTSTART:${this.formatIcsDate(start)}`,
            `DTEND:${this.formatIcsDate(end)}`,
            wrap('SUMMARY', row.title),
            row.description ? wrap('DESCRIPTION', row.description) : null,
            `STATUS:${row.status === 'done' || row.status === 'cancelled' ? 'CONFIRMED' : 'TENTATIVE'}`,
            `URL:${process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'}/app/${workspaceId}?task=${row.id}`,
            'END:VEVENT',
        ]
            .filter((l) => Boolean(l))
            .join('\r\n');
    }
    formatIcsDate(d) {
        const pad = (n) => String(n).padStart(2, '0');
        return (`${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
            `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`);
    }
    escapeIcsText(text) {
        // Per RFC 5545: backslash, comma, semicolon, and newlines need escaping.
        return text
            .replace(/\\/g, '\\\\')
            .replace(/\n/g, '\\n')
            .replace(/,/g, '\\,')
            .replace(/;/g, '\\;');
    }
    // ─── google calendar HTTP layer ───────────────────────────────────────────
    async upsertGoogleEvent(conn, task) {
        const token = await this.ensureFreshToken(conn);
        const [existingLink] = await this.db
            .select()
            .from(db_1.taskCalendarLinks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.taskId, task.id), (0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.provider, 'gcal'), (0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.userId, conn.connectedById)))
            .limit(1);
        const body = JSON.stringify({
            summary: task.title,
            description: task.description ?? undefined,
            start: { dateTime: (task.startDate ?? task.dueDate).toISOString() },
            end: { dateTime: task.dueDate.toISOString() },
            // Embedding the task id makes the round-trip back identifiable.
            extendedProperties: { private: { rundeskTaskId: task.id } },
        });
        const url = existingLink
            ? `https://www.googleapis.com/calendar/v3/calendars/${SYNC_TARGET_CALENDAR}/events/${existingLink.externalEventId}`
            : `https://www.googleapis.com/calendar/v3/calendars/${SYNC_TARGET_CALENDAR}/events`;
        const res = await fetch(url, {
            method: existingLink ? 'PUT' : 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body,
        });
        if (!res.ok) {
            throw new Error(`Google Calendar ${existingLink ? 'PUT' : 'POST'} ${res.status}: ${await res.text()}`);
        }
        const event = (await res.json());
        if (existingLink) {
            await this.db
                .update(db_1.taskCalendarLinks)
                .set({ etag: event.etag ?? null, lastSyncedAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.id, existingLink.id));
        }
        else {
            await this.db.insert(db_1.taskCalendarLinks).values({
                taskId: task.id,
                userId: conn.connectedById,
                workspaceId: conn.workspaceId,
                provider: 'gcal',
                externalCalendarId: SYNC_TARGET_CALENDAR,
                externalEventId: event.id,
                etag: event.etag ?? null,
            });
        }
    }
    async deleteGoogleEvent(conn, calendarId, eventId) {
        const token = await this.ensureFreshToken(conn);
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        // 404/410 mean the event is already gone — treat as success.
        if (!res.ok && res.status !== 404 && res.status !== 410) {
            throw new Error(`Google Calendar DELETE ${res.status}: ${await res.text()}`);
        }
    }
    async listGoogleEvents(conn) {
        const token = await this.ensureFreshToken(conn);
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const url = `https://www.googleapis.com/calendar/v3/calendars/${SYNC_TARGET_CALENDAR}/events?updatedMin=${encodeURIComponent(since)}&singleEvents=true&maxResults=250`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
            throw new Error(`Google Calendar LIST ${res.status}: ${await res.text()}`);
        }
        const body = (await res.json());
        return (body.items ?? [])
            .filter((e) => e.status !== 'cancelled' && e.start && (e.start.dateTime || e.start.date))
            .map((e) => ({
            id: e.id,
            summary: e.summary ?? '(untitled)',
            description: e.description,
            start: new Date(e.start.dateTime ?? e.start.date),
            end: new Date(e.end?.dateTime ?? e.end?.date ?? e.start.dateTime ?? e.start.date),
            etag: e.etag,
            htmlLink: e.htmlLink,
        }));
    }
    // ─── outlook (microsoft graph) HTTP layer ─────────────────────────────────
    async upsertOutlookEvent(conn, task) {
        const token = await this.ensureFreshToken(conn);
        const [existingLink] = await this.db
            .select()
            .from(db_1.taskCalendarLinks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.taskId, task.id), (0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.provider, 'outlook'), (0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.userId, conn.connectedById)))
            .limit(1);
        const body = JSON.stringify({
            subject: task.title,
            body: { contentType: 'text', content: task.description ?? '' },
            start: { dateTime: (task.startDate ?? task.dueDate).toISOString(), timeZone: 'UTC' },
            end: { dateTime: task.dueDate.toISOString(), timeZone: 'UTC' },
            singleValueExtendedProperties: [
                {
                    // Microsoft Graph's flavour of custom metadata. The GUID identifies
                    // our extension; the value lets us round-trip the task id.
                    id: 'String {6e7f5f3a-1234-5678-9abc-def012345678} Name rundeskTaskId',
                    value: task.id,
                },
            ],
        });
        const url = existingLink
            ? `https://graph.microsoft.com/v1.0/me/events/${existingLink.externalEventId}`
            : `https://graph.microsoft.com/v1.0/me/events`;
        const res = await fetch(url, {
            method: existingLink ? 'PATCH' : 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body,
        });
        if (!res.ok) {
            throw new Error(`Outlook ${existingLink ? 'PATCH' : 'POST'} ${res.status}: ${await res.text()}`);
        }
        const event = (await res.json());
        const etag = event['@odata.etag'] ?? null;
        if (existingLink) {
            await this.db
                .update(db_1.taskCalendarLinks)
                .set({ etag, lastSyncedAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.taskCalendarLinks.id, existingLink.id));
        }
        else {
            await this.db.insert(db_1.taskCalendarLinks).values({
                taskId: task.id,
                userId: conn.connectedById,
                workspaceId: conn.workspaceId,
                provider: 'outlook',
                externalCalendarId: 'me',
                externalEventId: event.id,
                etag,
            });
        }
    }
    async deleteOutlookEvent(conn, eventId) {
        const token = await this.ensureFreshToken(conn);
        const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok && res.status !== 404 && res.status !== 410) {
            throw new Error(`Outlook DELETE ${res.status}: ${await res.text()}`);
        }
    }
    async listOutlookEvents(conn) {
        const token = await this.ensureFreshToken(conn);
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const url = `https://graph.microsoft.com/v1.0/me/events?$filter=lastModifiedDateTime ge ${since}&$top=250`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
            throw new Error(`Outlook LIST ${res.status}: ${await res.text()}`);
        }
        const body = (await res.json());
        return (body.value ?? [])
            .filter((e) => !e.isCancelled && e.start?.dateTime && e.end?.dateTime)
            .map((e) => ({
            id: e.id,
            summary: e.subject ?? '(untitled)',
            description: e.bodyPreview,
            start: new Date(e.start.dateTime),
            end: new Date(e.end.dateTime),
            etag: e['@odata.etag'],
        }));
    }
    // ─── shared HTTP / token helpers ──────────────────────────────────────────
    /**
     * Return a usable access token for this connection, refreshing via the
     * refresh_token grant if it's expired or near expiry (60s buffer).
     * Updates the persisted token + expiry on success.
     */
    async ensureFreshToken(conn) {
        if (!conn.accessToken)
            throw new common_1.BadRequestException(`No access token for ${conn.provider}`);
        const expiresIn = conn.tokenExpiresAt ? conn.tokenExpiresAt.getTime() - Date.now() : Infinity;
        if (expiresIn > 60_000)
            return conn.accessToken;
        if (!conn.refreshToken) {
            throw new common_1.BadRequestException(`Token expired for ${conn.provider} and no refresh_token stored`);
        }
        const cfg = this.getProviderTokenConfig(conn.provider);
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: conn.refreshToken,
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
        });
        const res = await fetch(cfg.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
        if (!res.ok) {
            throw new Error(`OAuth refresh failed for ${conn.provider}: ${res.status} ${await res.text()}`);
        }
        const body = (await res.json());
        const newExpiry = body.expires_in
            ? new Date(Date.now() + body.expires_in * 1000)
            : null;
        await this.db
            .update(db_1.workspaceIntegrationConnections)
            .set({
            accessToken: body.access_token,
            refreshToken: body.refresh_token ?? conn.refreshToken,
            tokenExpiresAt: newExpiry,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.id, conn.id));
        conn.accessToken = body.access_token;
        conn.tokenExpiresAt = newExpiry;
        return body.access_token;
    }
    getProviderTokenConfig(provider) {
        if (provider === 'gcal') {
            return {
                tokenUrl: 'https://oauth2.googleapis.com/token',
                clientId: process.env.GOOGLE_CLIENT_ID ?? '',
                clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
            };
        }
        return {
            tokenUrl: process.env.MICROSOFT_TOKEN_URL ??
                'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            clientId: process.env.MICROSOFT_CLIENT_ID ?? '',
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
        };
    }
    // ─── lookups ──────────────────────────────────────────────────────────────
    async resolveTaskContext(taskId) {
        const [row] = await this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            description: db_1.tasks.description,
            startDate: db_1.tasks.startDate,
            dueDate: db_1.tasks.dueDate,
            isArchived: db_1.tasks.isArchived,
            workspaceId: db_1.spaces.workspaceId,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (!row)
            return null;
        const connections = await this.loadConnectionsByIds([row.workspaceId]);
        return { task: row, connections };
    }
    async loadConnectionsByIds(workspaceIds) {
        if (workspaceIds.length === 0)
            return [];
        const rows = await this.db
            .select()
            .from(db_1.workspaceIntegrationConnections)
            .where((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.status, 'connected'));
        return rows
            .filter((r) => workspaceIds.includes(r.workspaceId))
            .filter((r) => r.provider === 'gcal' || r.provider === 'outlook')
            .map(toConnectionRow);
    }
    async requireConnection(workspaceId, provider) {
        const [row] = await this.db
            .select()
            .from(db_1.workspaceIntegrationConnections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.provider, provider), (0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.status, 'connected')))
            .limit(1);
        if (!row) {
            throw new common_1.NotFoundException(`No connected ${provider} integration for workspace ${workspaceId}`);
        }
        return toConnectionRow(row);
    }
};
exports.CalendarSyncService = CalendarSyncService;
exports.CalendarSyncService = CalendarSyncService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], CalendarSyncService);
function toConnectionRow(r) {
    return {
        id: r.id,
        workspaceId: r.workspaceId,
        provider: r.provider,
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        tokenExpiresAt: r.tokenExpiresAt,
        externalAccountEmail: r.externalAccountEmail,
        metadata: r.metadata,
        connectedById: r.connectedById,
    };
}
//# sourceMappingURL=calendar-sync.service.js.map