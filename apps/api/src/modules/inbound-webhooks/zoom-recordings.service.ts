import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { taskExternalLinks, workspaceIntegrationConnections } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { extractMeetingIdFromWebhook, extractZoomRecordingUrl } from './zoom-recordings.util'

export interface RecordingAttachSummary {
  ok: boolean
  meetingId: string | null
  meetingLinks: number
  attached: number
  skippedExisting: number
  skippedNoConnection: number
  skippedNoRecording: number
}

interface ZoomConnection {
  id: string
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: Date | null
}

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
@Injectable()
export class ZoomRecordingsService {
  private readonly logger = new Logger(ZoomRecordingsService.name)

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /** Entry point for the `recording.completed` webhook payload. */
  async handleRecordingCompleted(payload: unknown): Promise<RecordingAttachSummary> {
    const meetingId = extractMeetingIdFromWebhook(payload)
    if (!meetingId) {
      return {
        ok: true,
        meetingId: null,
        meetingLinks: 0,
        attached: 0,
        skippedExisting: 0,
        skippedNoConnection: 0,
        skippedNoRecording: 0,
      }
    }
    return this.attachRecordingForMeeting(meetingId)
  }

  /**
   * Given a Zoom meeting id, find every task meeting-link created for it, fetch
   * the recording via the Zoom API, and attach a kind:'recording' link. Handles
   * the (rare) case where the same meeting is linked from multiple tasks.
   */
  async attachRecordingForMeeting(meetingId: string): Promise<RecordingAttachSummary> {
    const summary: RecordingAttachSummary = {
      ok: true,
      meetingId,
      meetingLinks: 0,
      attached: 0,
      skippedExisting: 0,
      skippedNoConnection: 0,
      skippedNoRecording: 0,
    }

    const meetingLinks = await this.db
      .select({
        id: taskExternalLinks.id,
        taskId: taskExternalLinks.taskId,
        workspaceId: taskExternalLinks.workspaceId,
        title: taskExternalLinks.title,
        metadata: taskExternalLinks.metadata,
      })
      .from(taskExternalLinks)
      .where(
        and(
          eq(taskExternalLinks.provider, 'zoom'),
          eq(taskExternalLinks.kind, 'meeting'),
          eq(taskExternalLinks.externalId, meetingId),
        ),
      )
    summary.meetingLinks = meetingLinks.length
    if (meetingLinks.length === 0) return summary

    // Cache the recording fetch + connection per workspace so N task-links for
    // the same meeting in one workspace hit Zoom at most once.
    const recordingByWorkspace = new Map<
      string,
      { shareUrl: string; metadata: Record<string, unknown> } | null
    >()

    for (const link of meetingLinks) {
      // Idempotency: skip if this task already has the recording attached.
      const [existing] = await this.db
        .select({ id: taskExternalLinks.id })
        .from(taskExternalLinks)
        .where(
          and(
            eq(taskExternalLinks.taskId, link.taskId),
            eq(taskExternalLinks.kind, 'recording'),
            eq(taskExternalLinks.externalId, meetingId),
          ),
        )
        .limit(1)
      if (existing) {
        summary.skippedExisting += 1
        continue
      }

      let recording = recordingByWorkspace.get(link.workspaceId)
      if (recording === undefined) {
        recording = await this.fetchRecording(link.workspaceId, meetingId)
        recordingByWorkspace.set(link.workspaceId, recording)
      }
      if (recording === null) {
        // Either Zoom isn't connected for this workspace (env-gate) or there is
        // no usable recording / the fetch failed — both degrade to a skip.
        // Distinguish the connection case for the summary.
        const connected = await this.loadZoomConnection(link.workspaceId)
        if (!connected) summary.skippedNoConnection += 1
        else summary.skippedNoRecording += 1
        continue
      }

      await this.db.insert(taskExternalLinks).values({
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
      })
      summary.attached += 1
    }

    if (summary.attached > 0) {
      this.logger.log(`Attached Zoom recording for meeting ${meetingId} to ${summary.attached} task(s)`)
    }
    return summary
  }

  /**
   * Fetch + parse the recording for a meeting using the workspace's Zoom
   * connection. Returns null when Zoom isn't connected, the API call fails, or
   * there's no usable recording yet.
   */
  private async fetchRecording(
    workspaceId: string,
    meetingId: string,
  ): Promise<{ shareUrl: string; metadata: Record<string, unknown> } | null> {
    const conn = await this.loadZoomConnection(workspaceId)
    if (!conn) return null

    try {
      const token = await this.ensureZoomToken(conn)
      const base = process.env.ZOOM_API_URL ?? 'https://api.zoom.us/v2'
      const res = await fetch(`${base}/meetings/${encodeURIComponent(meetingId)}/recordings`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) return null
      const body = (await res.json()) as Parameters<typeof extractZoomRecordingUrl>[0]
      const extracted = extractZoomRecordingUrl(body)
      if (!extracted) return null
      return {
        shareUrl: extracted.shareUrl,
        metadata: {
          recordingUrl: extracted.shareUrl,
          playUrl: extracted.playUrl,
          downloadUrl: extracted.downloadUrl,
          recordingCount: extracted.recordingCount,
          totalSize: extracted.totalSize,
        },
      }
    } catch {
      return null
    }
  }

  private async loadZoomConnection(workspaceId: string): Promise<ZoomConnection | null> {
    const [conn] = await this.db
      .select({
        id: workspaceIntegrationConnections.id,
        status: workspaceIntegrationConnections.status,
        accessToken: workspaceIntegrationConnections.accessToken,
        refreshToken: workspaceIntegrationConnections.refreshToken,
        tokenExpiresAt: workspaceIntegrationConnections.tokenExpiresAt,
      })
      .from(workspaceIntegrationConnections)
      .where(
        and(
          eq(workspaceIntegrationConnections.workspaceId, workspaceId),
          eq(workspaceIntegrationConnections.provider, 'zoom'),
        ),
      )
      .limit(1)
    if (!conn || conn.status !== 'connected' || !conn.accessToken) return null
    return {
      id: conn.id,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      tokenExpiresAt: conn.tokenExpiresAt,
    }
  }

  /**
   * Return a usable Zoom access token, refreshing via the refresh_token grant
   * (HTTP Basic client auth, per Zoom) when the stored token is expired/near
   * expiry. A refresh failure falls back to the stored token so a flaky refresh
   * doesn't block the attach — mirrors TasksService.ensureMeetingToken.
   */
  private async ensureZoomToken(conn: ZoomConnection): Promise<string> {
    const remaining = conn.tokenExpiresAt ? conn.tokenExpiresAt.getTime() - Date.now() : Infinity
    if (remaining > 60_000 || !conn.refreshToken) return conn.accessToken

    const tokenUrl = process.env.ZOOM_TOKEN_URL ?? 'https://zoom.us/oauth/token'
    const clientId = process.env.ZOOM_CLIENT_ID ?? ''
    const clientSecret = process.env.ZOOM_CLIENT_SECRET ?? ''
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken })
    try {
      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) return conn.accessToken
      const tok = (await res.json()) as { access_token?: string; expires_in?: number; refresh_token?: string }
      if (!tok.access_token) return conn.accessToken
      await this.db
        .update(workspaceIntegrationConnections)
        .set({
          accessToken: tok.access_token,
          refreshToken: tok.refresh_token ?? conn.refreshToken,
          tokenExpiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
          updatedAt: new Date(),
        })
        .where(eq(workspaceIntegrationConnections.id, conn.id))
      return tok.access_token
    } catch {
      return conn.accessToken
    }
  }
}
