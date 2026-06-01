import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  body!: string

  @IsOptional()
  @IsString()
  parentCommentId?: string

  @IsOptional()
  @IsArray()
  mentions?: Array<{ userId: string; offset: number; length: number }>
}
