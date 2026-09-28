import { Module } from '@nestjs/common'
import { ListsService } from './lists.service'
import { ListsController } from './lists.controller'
import { ListStatusesService } from './list-statuses.service'
import { ListStatusesController } from './list-statuses.controller'
import { ScopedStatusesService } from './scoped-statuses.service'
import { StatusShapeGuard } from './status-shape.guard'
import { SpaceStatusesController, ProjectStatusesController } from './scoped-statuses.controller'
import { SecurityModule } from '../security/security.module'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  // CustomRolesModule: deleting a list somebody else made asks `list.delete`.
  imports: [SecurityModule, CustomRolesModule],
  providers: [ListsService, ListStatusesService, ScopedStatusesService, StatusShapeGuard],
  controllers: [
    ListsController,
    ListStatusesController,
    SpaceStatusesController,
    ProjectStatusesController,
  ],
  exports: [ListsService, ListStatusesService, ScopedStatusesService],
})
export class ListsModule {}
