import { Module } from '@nestjs/common'
import { FavoritesService } from './favorites.service'
import { FavoritesController } from './favorites.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  providers: [FavoritesService, WorkspaceMemberGuard],
  controllers: [FavoritesController],
  exports: [FavoritesService],
})
export class FavoritesModule {}
