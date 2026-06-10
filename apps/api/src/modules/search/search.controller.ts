import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { SearchService } from './search.service'

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class SearchController {
  constructor(private search: SearchService) {}

  @Get(':workspaceId')
  query(
    @Param('workspaceId') workspaceId: string,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.search.search(workspaceId, q ?? '', limit ? Number(limit) : 10)
  }

  @Post(':workspaceId/reindex')
  reindex(@Param('workspaceId') workspaceId: string) {
    return this.search.reindexWorkspace(workspaceId)
  }
}
