import { Module } from '@nestjs/common'
import { SupportService } from './support.service'
import { SupportController, PublicStatusController } from './support.controller'
import { PlansModule } from '../plans/plans.module'

/**
 * Customer Support & Help Center (Plan §14.4). Human support (tickets + SLA) and
 * the public status page. Complements the AI help center in the AI module.
 * Imports PlansModule so ticket creation can gate on the workspace's plan tier
 * (paid-only) and scale SLA clocks by tier.
 */
@Module({
  imports: [PlansModule],
  controllers: [SupportController, PublicStatusController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
