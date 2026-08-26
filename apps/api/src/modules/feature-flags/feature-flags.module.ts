import { Module, Global } from '@nestjs/common'
import { FeatureFlagsService } from './feature-flags.service'
import { FeatureFlagsController } from './feature-flags.controller'
import { SecurityModule } from '../security/security.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Global()
@Module({
  // §2.8 gap 11 — "Contact your admin" tells the admins, so this module needs
  // to be able to write a notification.
  imports: [SecurityModule, NotificationsModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
