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
var ZoomRecordingsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZoomRecordingsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const zoom_recordings_util_1 = require("./zoom-recordings.util");
/**
 * §12.9 — after a Zoom meeting ends, fetch its cloud recording and attach the
 * share URL to the task(s) the meeting was created for, as a
 * `task_external_links` row (kind:'recording').
 *
 * Triggered by the `recording.completed` inbound webhook (see the controller).
 * Env-gated on the *Zoom connection*: recordings are only fetched when the
 * meeting link's workspace has Zoom connected. Idempotent: a recording already
 * attached for a meeting is never attached twice.
 */
let ZoomRecordingsService = ZoomRecordingsService_1 = class ZoomRecordingsService {
    constructor(db) {
        this.db = db;
        this.logger = new common_1.Logger(ZoomRecordingsService_1.name);
    }
    /** Entry point for the `recording.completed` webhook payload. */
    async handleRecordingCompleted(payload) {
        const meetingId = (0, zoom_recordings_util_1.extractMeetingIdFromWebhook)(payload);
        if (!meetingId) {
            return {
                ok: true,
                meetingId: null,
                meetingLinks: 0,
                attached: 0,
                skippedExisting: 0,
                skippedNoConnection: 0,
                skippedNoRecording: 0,
            };
        }
        return this.attachRecordingForMeeting(meetingId);
    }
    /**
     * Given a Zoom meeting id, find every task meeting-link created for it, fetch
     * the recording via the Zoom API, and attach a kind:'recording' link. Handles
     * the (rare) case where the same meeting is linked from multiple tasks.
     */
    async attachRecordingForMeeting(meetingId) {
        const summary = {
            ok: true,
            meetingId,
            meetingLinks: 0,
            attached: 0,
            skippedExisting: 0,
            skippedNoConnection: 0,
            skippedNoRecording: 0,
        };
        const meetingLinks = await this.db
            .select({
            id: db_1.taskExternalLinks.id,
            taskId: db_1.taskExternalLinks.taskId,
            workspaceId: db_1.taskExternalLinks.workspaceId,
            title: db_1.taskExternalLinks.title,
            metadata: db_1.taskExternalLinks.metadata,
        })
            .from(db_1.taskExternalLinks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskExternalLinks.provider, 'zoom'), (0, drizzle_orm_1.eq)(db_1.taskExternalLinks.kind, 'meeting'), (0, drizzle_orm_1.eq)(db_1.taskExternalLinks.externalId, meetingId)));
        summary.meetingLinks = meetingLinks.length;
        if (meetingLinks.length === 0)
            return summary;
        // Cache the recording fetch + connection per workspace so N task-links for
        // the same meeting in one workspace hit Zoom at most once.
        const recordingByWorkspace = new Map();
        for (const link of meetingLinks) {
            // Idempotency: skip if this task already has the recording attached.
            const [existing] = await this.db
                .select({ id: db_1.taskExternalLinks.id })
                .from(db_1.taskExternalLinks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskExternalLinks.taskId, link.taskId), (0, drizzle_orm_1.eq)(db_1.taskExternalLinks.kind, 'recording'), (0, drizzle_orm_1.eq)(db_1.taskExternalLinks.externalId, meetingId)))
                .limit(1);
            if (existing) {
                summary.skippedExisting += 1;
                continue;
            }
            let recording = recordingByWorkspace.get(link.workspaceId);
            if (recording === undefined) {
                recording = await this.fetchRecording(link.workspaceId, meetingId);
                recordingByWorkspace.set(link.workspaceId, recording);
            }
            if (recording === null) {
                // Either Zoom isn't connected for this workspace (env-gate) or there is
                // no usable recording / the fetch failed — both degrade to a skip.
                // Distinguish the connection case for the summary.
                const connected = await this.loadZoomConnection(link.workspaceId);
                if (!connected)
                    summary.skippedNoConnection += 1;
                else
                    summary.skippedNoRecording += 1;
                continue;
            }
            await this.db.insert(db_1.taskExternalLinks).values({
                taskId: link.taskId,
                workspaceId: link.workspaceId,
                provider: 'zoom',
                kind: 'recording',
                url: recording.shareUrl,
                externalId: meetingId,
                title: link.title ? `${link.title} — recording` : 'Meeting recording',
                status: null,
                metadata: { ...recording.metadata, source: 'zoom_webhook', meetingId },
                createdById: null,
            });
            summary.attached += 1;
        }
        if (summary.attached > 0) {
            this.logger.log(`Attached Zoom recording for meeting ${meetingId} to ${summary.attached} task(s)`);
        }
        return summary;
    }
    /**
     * Fetch + parse the recording for a meeting using the workspace's Zoom
     * connection. Returns null when Zoom isn't connected, the API call fails, or
     * there's no usable recording yet.
     */
    async fetchRecording(workspaceId, meetingId) {
        const conn = await this.loadZoomConnection(workspaceId);
        if (!conn)
            return null;
        try {
            const token = await this.ensureZoomToken(conn);
            const base = process.env.ZOOM_API_URL ?? 'https://api.zoom.us/v2';
            const res = await fetch(`${base}/meetings/${encodeURIComponent(meetingId)}/recordings`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(15_000),
            });
            if (!res.ok)
                return null;
            const body = (await res.json());
            const extracted = (0, zoom_recordings_util_1.extractZoomRecordingUrl)(body);
            if (!extracted)
                return null;
            return {
                shareUrl: extracted.shareUrl,
                metadata: {
                    recordingUrl: extracted.shareUrl,
                    playUrl: extracted.playUrl,
                    downloadUrl: extracted.downloadUrl,
                    recordingCount: extracted.recordingCount,
                    totalSize: extracted.totalSize,
                },
            };
        }
        catch {
            return null;
        }
    }
    async loadZoomConnection(workspaceId) {
        const [conn] = await this.db
            .select({
            id: db_1.workspaceIntegrationConnections.id,
            status: db_1.workspaceIntegrationConnections.status,
            accessToken: db_1.workspaceIntegrationConnections.accessToken,
            refreshToken: db_1.workspaceIntegrationConnections.refreshToken,
            tokenExpiresAt: db_1.workspaceIntegrationConnections.tokenExpiresAt,
        })
            .from(db_1.workspaceIntegrationConnections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.provider, 'zoom')))
            .limit(1);
        if (!conn || conn.status !== 'connected' || !conn.accessToken)
            return null;
        return {
            id: conn.id,
            accessToken: conn.accessToken,
            refreshToken: conn.refreshToken,
            tokenExpiresAt: conn.tokenExpiresAt,
        };
    }
    /**
     * Return a usable Zoom access token, refreshing via the refresh_token grant
     * (HTTP Basic client auth, per Zoom) when the stored token is expired/near
     * expiry. A refresh failure falls back to the stored token so a flaky refresh
     * doesn't block the attach — mirrors TasksService.ensureMeetingToken.
     */
    async ensureZoomToken(conn) {
        const remaining = conn.tokenExpiresAt ? conn.tokenExpiresAt.getTime() - Date.now() : Infinity;
        if (remaining > 60_000 || !conn.refreshToken)
            return conn.accessToken;
        const tokenUrl = process.env.ZOOM_TOKEN_URL ?? 'https://zoom.us/oauth/token';
        const clientId = process.env.ZOOM_CLIENT_ID ?? '';
        const clientSecret = process.env.ZOOM_CLIENT_SECRET ?? '';
        const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken });
        try {
            const res = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                },
                body: body.toString(),
                signal: AbortSignal.timeout(15_000),
            });
            if (!res.ok)
                return conn.accessToken;
            const tok = (await res.json());
            if (!tok.access_token)
                return conn.accessToken;
            await this.db
                .update(db_1.workspaceIntegrationConnections)
                .set({
                accessToken: tok.access_token,
                refreshToken: tok.refresh_token ?? conn.refreshToken,
                tokenExpiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.id, conn.id));
            return tok.access_token;
        }
        catch {
            return conn.accessToken;
        }
    }
};
exports.ZoomRecordingsService = ZoomRecordingsService;
exports.ZoomRecordingsService = ZoomRecordingsService = ZoomRecordingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ZoomRecordingsService);
//# sourceMappingURL=zoom-recordings.service.js.map