import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class CreateWorkspaceDto {
  /*
   * 2 to 60 characters as a person counts them, trimmed, never blank: the
   * service asks `cleanWorkspaceName` (QA WS-002), which counts an emoji as one
   * character where `MaxLength` counted two. This bound only keeps a payload sane.
   */
  @IsString()
  @MaxLength(400)
  name!: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers, and dashes' })
  slug?: string

  @IsOptional()
  @IsString()
  logoUrl?: string

  @IsOptional()
  @IsString()
  primaryColor?: string

  /**
   * §7 — the answers the create flow collects.
   *
   * Declared here because they would otherwise never arrive: the global
   * ValidationPipe runs with whitelist: true, so a field absent from this class
   * is stripped in transit and the handler sees undefined. That is exactly how
   * §1.1's taskTypeId went missing — the client sent it, the server never saw
   * it, and nothing anywhere reported a problem.
   */
  @IsOptional()
  @IsIn(['work', 'personal', 'school'])
  purpose?: string

  /** What they were using before. Null when they take the skip. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  comingFrom?: string
}
