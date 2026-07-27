import { Module } from '@nestjs/common'
import { SharesService } from './shares.service'
import { SharesController } from './shares.controller'
import { SecurityModule } from '../security/security.module'

@Module({
  imports: [SecurityModule],
  controllers: [SharesController],
  providers: [SharesService],
  exports: [SharesService],
})
export class SharesModule {}
