import { Module } from '@nestjs/common'
import { FoldersService } from './folders.service'
import { FoldersController } from './folders.controller'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { SecurityModule } from '../security/security.module'

@Module({
  imports: [CustomRolesModule, SecurityModule],
  controllers: [FoldersController],
  providers: [FoldersService],
  exports: [FoldersService],
})
export class FoldersModule {}
