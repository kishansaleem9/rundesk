import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../../common/database/database.module'
import { ExternalLinkRefreshService } from './external-link-refresh.service'

/**
 * §12.2 — hosts the background @Cron that keeps task↔external links in sync
 * (Drive/Dropbox names, GitHub/GitLab PR & issue state). The service must be
 * provided here (and the module imported in AppModule) for its cron to register
 * with the already-configured ScheduleModule.
 */
@Module({
  imports: [DatabaseModule],
  providers: [ExternalLinkRefreshService],
  exports: [ExternalLinkRefreshService],
})
export class ExternalLinkSyncModule {}
