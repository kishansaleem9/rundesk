import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { SearchService, type SearchEntityType, type SearchFilters } from './search.service'

const ENTITY_TYPES: SearchEntityType[] = ['task', 'doc']
const STATUS_CATEGORIES = new Set(['open', 'in_progress', 'closed'])
const PRIORITIES = new Set(['urgent', 'high', 'normal', 'low'])

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
    @Query('types') types?: string,
    @Query('statusCategory') statusCategory?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
  ) {
    const filters: SearchFilters = {}
    if (types) {
      const parsed = types
        .split(',')
        .map((t) => t.trim())
        .filter((t): t is SearchEntityType => (ENTITY_TYPES as string[]).includes(t))
      if (parsed.length > 0) filters.types = parsed
    }
    if (statusCategory && STATUS_CATEGORIES.has(statusCategory)) {
      filters.statusCategory = statusCategory as SearchFilters['statusCategory']
    }
    if (priority && PRIORITIES.has(priority)) {
      filters.priority = priority as SearchFilters['priority']
    }
    if (assigneeId) filters.assigneeId = assigneeId
    return this.search.search(workspaceId, q ?? '', limit ? Number(limit) : 10, filters)
  }

  @Post(':workspaceId/reindex')
  reindex(@Param('workspaceId') workspaceId: string) {
    return this.search.reindexWorkspace(workspaceId)
  }
}
