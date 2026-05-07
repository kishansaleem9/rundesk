import { Module } from '@nestjs/common'
import { ClipsController } from './clips.controller'
import { ClipsService } from './clips.service'
import { EmailModule } from '../email/email.module'

@Module({
  imports: [EmailModule],
  controllers: [ClipsController],
  providers: [ClipsService],
})
export class ClipsModule {}

