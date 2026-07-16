import { ArrayNotEmpty, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator'

/**
 * Webhook create/update DTOs.
 *
 * These are the HTTP-boundary guard for the outbound-webhook SSRF sink: the
 * global ValidationPipe (whitelist + transform) rejects malformed input and,
 * crucially, `@IsUrl` restricts `url` to http/https so a webhook can never be
 * created — or later repointed — at a `file:`/`gopher:` or otherwise exotic
 * scheme. The private/reserved-IP rejection (literal IPs at write time, and
 * DNS-pinned re-validation on every redirect hop at delivery time) is enforced
 * in the service via the shared `safeFetch`/`assertSafeUrl` guard, using the
 * same canonical classifier for both create/update and delivery.
 *
 * `require_tld: false` keeps `@IsUrl` from false-rejecting otherwise-valid
 * hosts; the authoritative host/IP safety check is `assertSafeUrl` in the
 * service, not this decorator.
 */
const WEBHOOK_URL_OPTS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false }

export class CreateWebhookDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsUrl(WEBHOOK_URL_OPTS)
  url!: string

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events!: string[]

  @IsOptional()
  @IsString()
  secret?: string
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsUrl(WEBHOOK_URL_OPTS)
  url?: string

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events?: string[]

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean
}
