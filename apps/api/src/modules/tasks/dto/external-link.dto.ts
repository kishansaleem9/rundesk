import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator'

const PROVIDERS = ['github', 'gitlab', 'google_drive', 'link'] as const

/**
 * Create a task ↔ external-service link (Plan §12.8 / §12.2). Only `url` is
 * required — the server parses it to detect provider + kind. `provider` is an
 * optional hint that disambiguates a generic link (e.g. an explicit
 * `google_drive` attach).
 */
export class CreateExternalLinkDto {
  @IsString()
  @IsNotEmpty()
  url!: string

  @IsOptional()
  @IsIn(PROVIDERS)
  provider?: (typeof PROVIDERS)[number]
}
