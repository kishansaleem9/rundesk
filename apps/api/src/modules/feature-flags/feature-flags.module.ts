import { Module, Global } from '@nestjs/common'
import { FeatureFlagsService } from './feature-flags.service'
import { FeatureFlagsController } from './feature-flags.controller'
import { SecurityModule } from '../security/security.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Global()
@Module({
  // §2.8 gap 11 — "Contact your admin" tells whoever may switch a ClickApp, so
  // this module needs to be able to write a notification. CustomRolesModule:
  // the override list and the switch ask `workspace.clickapps.manage`, and the
  // ask goes to its holders.
  imports: [SecurityModule, NotificationsModule, CustomRolesModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
