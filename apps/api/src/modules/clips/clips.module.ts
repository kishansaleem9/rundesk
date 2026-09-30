import { Module } from '@nestjs/common'
import { ClipsController, ClipsPublicController } from './clips.controller'
import { ClipsService } from './clips.service'
import { EmailModule } from '../email/email.module'

@Module({
  imports: [EmailModule],
  controllers: [ClipsController, ClipsPublicController],
  providers: [ClipsService],
})
export class ClipsModule {}

