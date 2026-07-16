import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../common/database/database.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { ZapierController } from './zapier.controller'
import { ZapierService } from './zapier.service'
import { ZapierApiKeyGuard } from './zapier-api-key.guard'

/**
 * Zapier integration (Plan §12.4). Reuses the outbound WebhooksModule for
 * subscribe/unsubscribe/delivery and authenticates with the existing workspace
 * API keys via {@link ZapierApiKeyGuard}.
 */
@Module({
  imports: [DatabaseModule, WebhooksModule],
  controllers: [ZapierController],
  providers: [ZapierService, ZapierApiKeyGuard],
})
export class ZapierModule {}
