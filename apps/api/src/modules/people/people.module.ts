import { Module } from '@nestjs/common'
import { PeopleService } from './people.service'
import { PeopleController, PrioritiesController } from './people.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

/**
 * §G06 [05:35–06:35] — the person profile panel and the priorities behind it.
 */
@Module({
  providers: [PeopleService, WorkspaceMemberGuard],
  controllers: [PeopleController, PrioritiesController],
  exports: [PeopleService],
})
export class PeopleModule {}
