import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator'

/**
 * A comment sent as email (`resume-defects/s4-composer-email`). Only the shapes
 * here: what each part may be — an address, a subject's length, an email with
 * no words and no file — is `CommentEmailService`'s to say, in words.
 */
export class SendCommentEmailDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  to!: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  cc?: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  bcc?: string[]

  @IsOptional()
  @IsString()
  subject?: string

  @IsString()
  body!: string

  @IsOptional()
  @IsString()
  parentCommentId?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  attachmentIds?: string[]
}
