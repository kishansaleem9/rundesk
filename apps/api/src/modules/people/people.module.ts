import { Module } from '@nestjs/common'
import { PeopleService } from './people.service'
import { PeopleController, PrioritiesController } from './people.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { AiModule } from '../ai/ai.module'
import { CalendarSyncModule } from '../calendar-sync/calendar-sync.module'

/**
 * §G06 [05:35–06:35] — the person profile panel and the priorities behind it.
 *
 * AiModule is imported for §G05's "Get StandUp", which asks a model to write up
 * what this module has already gathered. No cycle: nothing in AiModule's import
 * chain — Tasks, Notifications, Plans, Search, Skills, Docs — reaches People.
 *
 * CalendarSyncModule is §V2-14c's: a person's calendar view has to know when
 * they are busy according to the calendars they nominated, not only according
 * to Rundesk. It imports nothing itself, so there is no cycle to reason about.
 */
@Module({
  imports: [AiModule, CalendarSyncModule],
  providers: [PeopleService, WorkspaceMemberGuard],
  controllers: [PeopleController, PrioritiesController],
  exports: [PeopleService],
})
export class PeopleModule {}
