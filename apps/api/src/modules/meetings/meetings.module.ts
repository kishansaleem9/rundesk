import { Module } from '@nestjs/common'
import { MeetingsService } from './meetings.service'
import { MeetingsController } from './meetings.controller'
import { AiModule } from '../ai/ai.module'
import { TasksModule } from '../tasks/tasks.module'

@Module({
  imports: [AiModule, TasksModule],
  providers: [MeetingsService],
  controllers: [MeetingsController],
  exports: [MeetingsService],
})
export class MeetingsModule {}
