import { Module } from '@nestjs/common'
import { IntegrationConnectionsModule } from '../integrations/connections/integration-connections.module'
import { PlansModule } from '../plans/plans.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { EmailAccountsController } from './email-accounts.controller'
import { EmailAccountsService } from './email-accounts.service'

/** The mailboxes a task's email is sent from, and its signatures and templates (`found-9-oct/task-email-sends-from-the-server`). */
@Module({
  imports: [IntegrationConnectionsModule, PlansModule],
  controllers: [EmailAccountsController],
  providers: [EmailAccountsService, WorkspaceMemberGuard],
  exports: [EmailAccountsService],
})
export class EmailAccountsModule {}
