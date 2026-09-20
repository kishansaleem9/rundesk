import { Module } from '@nestjs/common'
import { SpacesService } from './spaces.service'
import { SpacesController, SpacePresetsController } from './spaces.controller'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { SecurityModule } from '../security/security.module'
import { ListsModule } from '../lists/lists.module'
import { PlansModule } from '../plans/plans.module'

@Module({
  // §V2-06 — a preset seeds the space's first lists through the lists
  // service, so a seeded list is made by the same path a hand-made one is.
  // PlansModule for the ClickApps plan gate (`[07:20]`); it depends only on the
  // global DatabaseModule, so it brings no cycle with it.
  imports: [CustomRolesModule, SecurityModule, ListsModule, PlansModule],
  providers: [SpacesService],
  controllers: [SpacesController, SpacePresetsController],
  exports: [SpacesService],
})
export class SpacesModule {}
