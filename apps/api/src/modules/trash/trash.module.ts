import { Module } from '@nestjs/common'
import { TrashService } from './trash.service'
import { TrashController } from './trash.controller'
import { SecurityModule } from '../security/security.module'

@Module({
  imports: [SecurityModule],
  controllers: [TrashController],
  providers: [TrashService],
  exports: [TrashService],
})
export class TrashModule {}
