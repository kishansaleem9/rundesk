import { Module } from '@nestjs/common'
import { ClipsController, ClipsPublicController } from './clips.controller'
import { ClipsService } from './clips.service'
import { EmailModule } from '../email/email.module'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'

@Module({
  imports: [EmailModule],
  controllers: [ClipsController, ClipsPublicController],
  providers: [ClipsService, RateLimitGuard],
})
export class ClipsModule {}

