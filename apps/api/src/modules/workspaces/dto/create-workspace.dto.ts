import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
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
}
