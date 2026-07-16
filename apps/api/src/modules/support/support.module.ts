import { Module } from '@nestjs/common'
import { SupportService } from './support.service'
import { SupportController, PublicStatusController } from './support.controller'

/**
 * Customer Support & Help Center (Plan §14.4). Human support (tickets + SLA) and
 * the public status page. Complements the AI help center in the AI module.
 */
@Module({
  controllers: [SupportController, PublicStatusController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
