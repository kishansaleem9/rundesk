import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
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
    @CurrentUser() user: { id: string },
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('types') types?: string,
    @Query('statusCategory') statusCategory?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('labelId') labelId?: string,
    @Query('dueAfter') dueAfter?: string,
    @Query('dueBefore') dueBefore?: string,
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
    if (labelId) filters.labelId = labelId
    const parseDate = (s?: string) => {
      if (!s) return undefined
      const d = new Date(s)
      return Number.isNaN(d.getTime()) ? undefined : d
    }
    filters.dueAfter = parseDate(dueAfter)
    filters.dueBefore = parseDate(dueBefore)
    return this.search.search(workspaceId, user.id, q ?? '', limit ? Number(limit) : 10, filters)
  }

  @Post(':workspaceId/reindex')
  reindex(@Param('workspaceId') workspaceId: string) {
    return this.search.reindexWorkspace(workspaceId)
  }

  @Get(':workspaceId/saved')
  listSaved(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.search.listSavedSearches(workspaceId, user.id)
  }

  @Post(':workspaceId/saved')
  createSaved(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { name: string; query?: string | null; filters?: Record<string, unknown> },
  ) {
    return this.search.createSavedSearch(workspaceId, user.id, body.name, body.query ?? null, body.filters ?? {})
  }

  @Delete(':workspaceId/saved/:id')
  deleteSaved(@Param('id') id: string, @CurrentUser() user: any) {
    return this.search.deleteSavedSearch(id, user.id)
  }
}
