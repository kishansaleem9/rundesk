import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator'

export class CreateFormDto {
  @IsString()
  @IsNotEmpty()
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  targetListId?: string

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean

  @IsOptional()
  @IsString()
  confirmationMsg?: string
}

export class AddFormFieldDto {
  @IsString()
  @IsNotEmpty()
  type!: string

  @IsString()
  @IsNotEmpty()
  label!: string

  @IsOptional()
  @IsString()
  placeholder?: string

  @IsOptional()
  @IsString()
  helpText?: string

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean

  @IsOptional()
  @IsInt()
  position?: number

  @IsOptional()
  @IsArray()
  options?: { label: string; value: string }[]

  @IsOptional()
  @IsIn(['all', 'any'])
  visibilityMode?: 'all' | 'any'

  @IsOptional()
  @IsArray()
  visibilityRules?: Array<{
    fieldId: string
    operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'
    value: string
  }>

  @IsOptional()
  @IsString()
  taskField?: string
}

export class SubmitFormDto {
  @IsOptional()
  @IsObject()
  data?: Record<string, string | string[]>

  @IsOptional()
  @IsString()
  submitterEmail?: string

  @IsOptional()
  @IsString()
  submitterName?: string
}
