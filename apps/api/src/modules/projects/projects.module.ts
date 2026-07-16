import { Module } from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { ProjectsController } from './projects.controller'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { SlackModule } from '../integrations/slack/slack.module'
import { PlansModule } from '../plans/plans.module'
import { SecurityModule } from '../security/security.module'

@Module({
  imports: [CustomRolesModule, WebhooksModule, SlackModule, PlansModule, SecurityModule],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
