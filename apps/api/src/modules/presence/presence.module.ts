import { Module } from '@nestjs/common'
import { PresenceService } from './presence.service'
import { PresenceController, PresenceMeController } from './presence.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  providers: [PresenceService, WorkspaceMemberGuard],
  controllers: [PresenceController, PresenceMeController],
  exports: [PresenceService],
})
export class PresenceModule {}
