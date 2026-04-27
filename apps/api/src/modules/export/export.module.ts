import { Module } from '@nestjs/common'
import { ExportService } from './export.service'
import { ExportController } from './export.controller'
import { DatabaseModule } from '../../common/database/database.module'

@Module({
  imports: [DatabaseModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
