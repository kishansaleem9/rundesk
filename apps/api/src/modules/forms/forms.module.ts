import { Module } from '@nestjs/common'
import { FormsService } from './forms.service'
import { WorkspaceFormsController, PublicFormsController } from './forms.controller'
import { DatabaseModule } from '../../common/database/database.module'

@Module({
  imports: [DatabaseModule],
  controllers: [WorkspaceFormsController, PublicFormsController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
