import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator'

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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelIds?: string[]
}
