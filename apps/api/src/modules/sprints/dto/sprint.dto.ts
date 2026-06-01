import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreateSprintDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsOptional()
  @IsString()
  goal?: string

  @IsDateString()
  startDate!: string

  @IsDateString()
  endDate!: string

  @IsOptional()
  @IsString()
  spaceId?: string | null
}
