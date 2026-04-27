import { Module } from '@nestjs/common'
import { SecurityService } from './security.service'
import { TotpController, ApiKeysController, AuditLogsController } from './security.controller'
import { DatabaseModule } from '../../common/database/database.module'

@Module({
  imports: [DatabaseModule],
  controllers: [TotpController, ApiKeysController, AuditLogsController],
  providers: [SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}
