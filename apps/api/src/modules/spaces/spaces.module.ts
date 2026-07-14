import { Module } from '@nestjs/common'
import { SpacesService } from './spaces.service'
import { SpacesController } from './spaces.controller'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  imports: [CustomRolesModule],
  providers: [SpacesService],
  controllers: [SpacesController],
  exports: [SpacesService],
})
export class SpacesModule {}
