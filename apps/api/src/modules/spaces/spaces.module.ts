import { Module } from '@nestjs/common'
import { SpacesService } from './spaces.service'
import { SpacesController } from './spaces.controller'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { SecurityModule } from '../security/security.module'

@Module({
  imports: [CustomRolesModule, SecurityModule],
  providers: [SpacesService],
  controllers: [SpacesController],
  exports: [SpacesService],
})
export class SpacesModule {}
