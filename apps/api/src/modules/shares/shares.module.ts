import { Module } from '@nestjs/common'
import { SharesService } from './shares.service'
import { SharesController } from './shares.controller'
import { SecurityModule } from '../security/security.module'
import { EmailModule } from '../email/email.module'

@Module({
  imports: [SecurityModule, EmailModule],
  controllers: [SharesController],
  providers: [SharesService],
  exports: [SharesService],
})
export class SharesModule {}
