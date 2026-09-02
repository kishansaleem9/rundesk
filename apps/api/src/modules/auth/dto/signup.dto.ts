import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsArray, ValidateNested, IsIn } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class InviteItemDto {
  @ApiProperty({ example: 'teammate@company.com' })
  @IsEmail()
  email!: string

  @ApiPropertyOptional({ enum: ['admin', 'member'], default: 'member' })
  @IsOptional()
  @IsIn(['admin', 'member'])
  orgRole?: 'admin' | 'member'

  @ApiPropertyOptional({ enum: ['workspace_admin', 'manager', 'member', 'guest'], default: 'member' })
  @IsOptional()
  @IsIn(['workspace_admin', 'manager', 'member', 'guest'])
  workspaceRole?: 'workspace_admin' | 'manager' | 'member' | 'guest'
}

export class SignupDto {
  // — account —
  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName!: string

  @ApiProperty({ example: 'ada@analytics.io' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: 'Secr3t!Pass' })
  @IsString()
  @MinLength(8)
  password!: string

  // — organization / workspace —
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  organizationName!: string

  @ApiPropertyOptional({ example: 'acme-corp' })
  @IsOptional()
  @IsString()
  organizationSlug?: string

  /*
   * `industry` and `teamSize` used to live here. The signup wizard made them
   * REQUIRED to advance past step 1, and nothing on the server ever read them
   * — two compulsory questions collecting data with no consumer.
   *
   * The walkthrough never asks for them: across 386 transcript lines and 143
   * catalogued frames she never says either word, and the ClickUp wizard she
   * holds up as the model does not ask them either. Removed rather than left
   * optional, because an unused field invites somebody to start reading it.
   *
   * `whitelist: true` with `forbidNonWhitelisted: false` (main.ts:39-44) means
   * an older client still sending them is not rejected — the fields are simply
   * dropped.
   */

  @ApiPropertyOptional({ type: [String], example: ['core', 'ai', 'chat'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[]

  // — initial invites —
  @ApiPropertyOptional({ type: [InviteItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InviteItemDto)
  invites?: InviteItemDto[]
}
