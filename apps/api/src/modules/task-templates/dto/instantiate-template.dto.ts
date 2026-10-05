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
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { LabelByNameDto } from '../../tasks/dto/task.dto'

const PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const

/**
 * `POST /workspaces/:ws/task-templates/:id/instantiate` — the list the task is
 * made in, the typed title, and what else the person set in the create modal
 * beside the template they chose (`found-30-sep/template-submit-ignores-the-form`).
 * Each of those is optional: a field the person left alone is not sent, and the
 * template's own value stands for it (`templateWithForm`).
 *
 * THE RULES `POST /tasks` KEEPS (`CreateTaskDto`), field for field, because this
 * is the same task made another way: a priority of the four, a task type by id,
 * people and labels by id, dates as ISO strings, the estimate in whole seconds
 * (and none below nothing). What each must also BE — a type of the list's,
 * people who can see the list, labels of this workspace —
 * `TasksService.createTask` asks, for this route as for that one, before
 * anything is written. The body was an untyped shape before: nothing in it was
 * checked, and nothing unknown was dropped.
 */
export class InstantiateTemplateDto {
  @IsString()
  @IsNotEmpty()
  listId!: string

  @IsOptional()
  @IsString()
  titleOverride?: string

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number]

  @IsOptional()
  @IsUUID()
  taskTypeId?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  timeEstimate?: number

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelIds?: string[]

  /**
   * The tags typed beside the template, by name — found or made only once the
   * task is, with the template's own (`found-30-sep/refused-create-leaves-tags`).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LabelByNameDto)
  labelsByName?: LabelByNameDto[]
}
