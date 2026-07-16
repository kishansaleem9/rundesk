/**
 * Zoom cloud-recording response parsing for the "auto-attach meeting recording
 * link after the meeting ends" gap (Plan §12.9).
 *
 * Pure + side-effect free so the extraction logic is unit-testable without a
 * live Zoom API. The service calls `GET /meetings/{meetingId}/recordings` (or
 * receives the equivalent `recording.completed` webhook `payload.object`) and
 * feeds the JSON here to pull out the share URL to persist.
 */

/** Shape of the pieces we read from a Zoom recordings response / webhook object. */
export interface ZoomRecordingsResponse {
  id?: number | string
  uuid?: string
  topic?: string
  share_url?: string
  password?: string
  total_size?: number
  recording_count?: number
  recording_files?: Array<{
    id?: string
    file_type?: string
    file_extension?: string
    recording_type?: string
    play_url?: string
    download_url?: string
    status?: string
  }>
}

export interface ExtractedRecording {
  /** The best "share" URL to store on the task link. */
  shareUrl: string
  /** The video file's play URL, when present (a nicer in-browser view). */
  playUrl: string | null
  downloadUrl: string | null
  topic: string | null
  recordingCount: number | null
  totalSize: number | null
}

/**
 * Pull the recording share URL (and useful metadata) out of a Zoom recordings
 * response. Preference order for the primary URL:
 *   1. top-level `share_url` (the shareable landing page for all files),
 *   2. the first completed video file's `play_url`,
 *   3. any file's `play_url` / `download_url`.
 * Returns null when there is nothing usable to attach (degrade cleanly — the
 * caller then simply skips, leaving the meeting link untouched for a retry).
 */
export function extractZoomRecordingUrl(
  body: ZoomRecordingsResponse | null | undefined,
): ExtractedRecording | null {
  if (!body || typeof body !== 'object') return null
  const files = Array.isArray(body.recording_files) ? body.recording_files : []

  const isVideo = (f: { file_type?: string }) => (f.file_type ?? '').toUpperCase() === 'MP4'
  const completed = files.filter((f) => (f.status ?? 'completed') === 'completed')
  const videoFile = completed.find(isVideo) ?? files.find(isVideo) ?? null
  const anyFile = completed[0] ?? files[0] ?? null

  const playUrl = videoFile?.play_url ?? anyFile?.play_url ?? null
  const downloadUrl = videoFile?.download_url ?? anyFile?.download_url ?? null

  const shareUrl =
    (typeof body.share_url === 'string' && body.share_url) ||
    playUrl ||
    downloadUrl ||
    null
  if (!shareUrl) return null

  return {
    shareUrl,
    playUrl,
    downloadUrl,
    topic: body.topic ?? null,
    recordingCount: typeof body.recording_count === 'number' ? body.recording_count : null,
    totalSize: typeof body.total_size === 'number' ? body.total_size : null,
  }
}

/**
 * Resolve the Zoom meeting id from a `recording.completed` webhook payload.
 * Zoom nests the meeting object under `payload.object`; `id` is the numeric
 * meeting id that matches the `external_id` we stored when creating the meeting.
 */
export function extractMeetingIdFromWebhook(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = (payload as { payload?: { object?: { id?: number | string } } }).payload?.object
  if (!obj || obj.id == null) return null
  return String(obj.id)
}
