import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

/**
 * A tag named for a task being made (`found-30-sep/refused-create-leaves-tags`):
 * found in its workspace by name, whatever the case, or made there with this
 * colour once the task is. The create modal sent `POST /workspaces/:ws/labels`
 * for each typed tag BEFORE the task, so a refused create left them behind.
 * The rules of that route (`CreateLabelDto`): a name, and a colour if given.
 */
export class LabelByNameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string
}

// Note: only the create handler is converted to a DTO. The update handler keeps
// an inline body because it relies on key-presence (`'dueDate' in body`) to
// distinguish "clear the date" from "leave unchanged", which a class instance
// (useDefineForClassFields) would break by always defining the property.

const PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  listId!: string

  @IsString()
  @IsNotEmpty()
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number]

  @IsOptional()
  @IsString()
  status?: string

  @IsOptional()
  @IsInt()
  position?: number

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @IsInt()
  timeEstimate?: number

  @IsOptional()
  @IsString()
  parentTaskId?: string

  /**
   * §1.1 — "yahan pe humein woh option hi nahi deta ke hum task type ko select
   * kar sakein". tasks.service.ts has taken a taskTypeId since task types
   * shipped, but the pipe runs with `whitelist: true`, so a client sending one
   * had it silently stripped before the service ever saw it: the create path
   * could only ever produce the list's default type.
   */
  @IsOptional()
  @IsUUID()
  taskTypeId?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelIds?: string[]

  /** Tags by name, made only once the task is (`LabelByNameDto`). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LabelByNameDto)
  labelsByName?: LabelByNameDto[]
}

/**
 * Add-attachment body. Previously an untyped `@Body() any`, which let a caller
 * send an arbitrary `storageKey` that the service stored/served verbatim — a
 * cross-tenant object-reference risk. Declaring the shape (with the global
 * `whitelist` ValidationPipe) drops unknown fields; the service additionally
 * enforces that a client `storageKey` sits under this task's own R2 prefix.
 */
export class AddAttachmentDto {
  @IsString()
  @IsNotEmpty()
  fileName!: string

  @IsOptional()
  @IsString()
  url?: string

  @IsOptional()
  @IsString()
  storageKey?: string

  @IsOptional()
  @IsString()
  contentType?: string

  @IsOptional()
  @IsInt()
  sizeBytes?: number
}

/**
 * §V2-S05 frame `05:25` — the clip that "Create a task" attaches. The key is
 * checked against this workspace's clips by shape in the service; the size and
 * type are read from the stored object, never taken from the caller.
 */
export class AttachClipDto {
  @IsString()
  @IsNotEmpty()
  storageKey!: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string
}
