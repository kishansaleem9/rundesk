import { IsString, IsNotEmpty, IsArray, IsOptional, IsBoolean, IsUUID } from 'class-validator'

export class CreateDashboardPresetDto {
  @IsUUID()
  @IsNotEmpty()
  workspaceId: string

  @IsString()
  @IsNotEmpty()
  name: string

  @IsArray()
  @IsNotEmpty()
  layout: any[]

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean
}

export class UpdateDashboardPresetDto {
  @IsString()
  @IsOptional()
  name?: string

  @IsArray()
  @IsOptional()
  layout?: any[]

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean
}
