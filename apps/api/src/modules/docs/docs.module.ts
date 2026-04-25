import { Module } from '@nestjs/common'
import { DocsService } from './docs.service'
import { DocsController } from './docs.controller'
import { RealtimeModule } from '../realtime/realtime.module'

@Module({
  imports: [RealtimeModule],
  providers: [DocsService],
  controllers: [DocsController],
  exports: [DocsService],
})
export class DocsModule {}
