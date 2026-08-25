import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'
import { SKILL_ARCHETYPES } from '../skill-templates'

/**
 * §15 — every field here is decorated on purpose.
 *
 * The global ValidationPipe runs with `whitelist: true`, so a property that is
 * declared but not decorated is stripped in transit and the handler sees
 * undefined — no error, no log, nothing to notice. That is exactly how §1.1's
 * `taskTypeId` went missing for a week: the client sent it, the server never
 * saw it, and every test passed.
 */
export class CreateSkillDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  instructions?: string

  @IsOptional()
  @IsIn(SKILL_ARCHETYPES)
  archetype?: string

  @IsOptional()
  @IsIn(['private', 'workspace'])
  visibility?: 'private' | 'workspace'

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class UpdateSkillDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  instructions?: string

  @IsOptional()
  @IsIn(['private', 'workspace'])
  visibility?: 'private' | 'workspace'

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class AddSkillMemoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  content!: string

  @IsOptional()
  @IsIn(['chat', 'manual'])
  source?: 'chat' | 'manual'
}

export class AddSkillConnectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  provider!: string

  /** Omitted when the workspace has not connected that provider yet. */
  @IsOptional()
  @IsUUID()
  connectionId?: string

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>
}
