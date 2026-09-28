import { Transform } from 'class-transformer'
import { IsBoolean, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

export const ANNOUNCEMENT_TONES = ['info', 'celebrate', 'warn'] as const
export type AnnouncementTone = (typeof ANNOUNCEMENT_TONES)[number]

/** A string's surrounding space is not a title: "   " is refused as "" is. */
const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

/*
 * EVERY FIELD IS DECORATED. The global ValidationPipe runs with `whitelist: true`,
 * so an undecorated field is stripped in transit. The body was typed inline, so
 * nothing was checked: a POST with no title reached `input.title.trim()` and
 * answered 500, and a PATCH could blank a live banner's title.
 */
export class CreateAnnouncementDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'An announcement needs a title' })
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string

  @IsOptional()
  @IsIn(ANNOUNCEMENT_TONES)
  tone?: AnnouncementTone

  /** A date or a date-time; null or absent is "no expiry". */
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null

  /** False saves it paused: listed to its managers, shown to nobody. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

export class UpdateAnnouncementDto {
  // Optional, but a title sent is a title: an empty one is refused, not stored.
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'An announcement needs a title' })
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string

  @IsOptional()
  @IsIn(ANNOUNCEMENT_TONES)
  tone?: AnnouncementTone

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null
}
