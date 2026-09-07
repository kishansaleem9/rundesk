import { Module } from '@nestjs/common'
import { SpacesService } from './spaces.service'
import { SpacesController, SpacePresetsController } from './spaces.controller'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { SecurityModule } from '../security/security.module'
import { ListsModule } from '../lists/lists.module'

@Module({
  // §V2-06 — a preset seeds the space's first lists through the lists
  // service, so a seeded list is made by the same path a hand-made one is.
  imports: [CustomRolesModule, SecurityModule, ListsModule],
  providers: [SpacesService],
  controllers: [SpacesController, SpacePresetsController],
  exports: [SpacesService],
})
export class SpacesModule {}
