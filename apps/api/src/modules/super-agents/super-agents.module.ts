import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { ChatModule } from '../chat/chat.module'
import { TasksModule } from '../tasks/tasks.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { SuperAgentsService } from './super-agents.service'
import { SuperAgentsRunner } from './super-agents.runner'
import { BrainComments } from './brain-comments'
import { SuperAgentsController, WorkspaceSuperAgentsController } from './super-agents.controller'

/**
 * SUPER AGENTS (`ledger-rows/row-852`). The runner listens on the seam the
 * tasks and chat modules speak into (`agent-triggers.ts`), so neither of them
 * imports this one; it is exported for the automation action that runs one.
 * @Brain in a comment answers through the same seam (`brain-comments.ts`).
 */
@Module({
  imports: [AiModule, ChatModule, TasksModule],
  providers: [SuperAgentsService, SuperAgentsRunner, BrainComments, WorkspaceMemberGuard],
  controllers: [WorkspaceSuperAgentsController, SuperAgentsController],
  exports: [SuperAgentsService, SuperAgentsRunner],
})
export class SuperAgentsModule {}
