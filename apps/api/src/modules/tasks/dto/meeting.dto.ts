import { IsIn, IsNotEmpty, IsString } from 'class-validator'

/**
 * Create a meeting from a task (Plan §12.9 Zoom / Google Meet). The provider
 * is required — the server creates a real meeting through the workspace's
 * connected Zoom (own OAuth connection) or Google Meet (reuses the Google
 * Calendar connection) and stores the join URL as a task↔external link.
 */
const MEETING_PROVIDERS = ['zoom', 'google_meet'] as const

export class CreateMeetingDto {
  @IsIn(MEETING_PROVIDERS)
  provider!: (typeof MEETING_PROVIDERS)[number]
}

/** Attach a post-meeting recording link to an existing meeting link. */
export class AttachRecordingDto {
  @IsString()
  @IsNotEmpty()
  url!: string
}
