import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../common/database/database.module'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { ClientPortalService } from './client-portal.service'
import { ClientPortalController, ClientPortalPublicController } from './client-portal.controller'

@Module({
  imports: [DatabaseModule],
  controllers: [ClientPortalController, ClientPortalPublicController],
  providers: [ClientPortalService, RateLimitGuard],
  exports: [ClientPortalService],
})
export class ClientPortalModule {}
