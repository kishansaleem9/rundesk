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

  // Ids of already-uploaded task_attachments to associate with this comment.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentIds?: string[]
}
