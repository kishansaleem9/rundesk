import { Module } from '@nestjs/common'
import { PlannerService } from './planner.service'
import { PlannerSectionsService } from './planner-sections.service'
import { PlannerController } from './planner.controller'
import { PeopleModule } from '../people/people.module'
import { CalendarSyncModule } from '../calendar-sync/calendar-sync.module'

/**
 * §V2-15b — `PeopleModule` is imported so the side-by-side team grid can ask
 * `PeopleService.getCalendar` for each column instead of writing a second
 * answer to "when is this person busy".
 *
 * No cycle: People imports Ai and CalendarSync, and neither of those — nor
 * anything they reach — imports Planner. `PlannerModule` is referenced in
 * exactly one place outside this directory, `app.module.ts`.
 */
@Module({
  imports: [PeopleModule, CalendarSyncModule],
  providers: [PlannerService, PlannerSectionsService],
  controllers: [PlannerController],
  exports: [PlannerService],
})
export class PlannerModule {}
