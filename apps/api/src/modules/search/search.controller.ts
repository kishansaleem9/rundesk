import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { FLAGS } from '@rundesk/feature-flags'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { SearchService, type SearchEntityType, type SearchFilters } from './search.service'
import { ENTITY_TYPES } from './entity-types'

const STATUS_CATEGORIES = new Set(['open', 'in_progress', 'closed'])
const PRIORITIES = new Set(['urgent', 'high', 'normal', 'low'])

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
// SEARCH is default-enabled; FeatureFlagGuard (after JwtAuthGuard) enforces the
// flag at the API so a disabled workspace can't reach search via direct calls.
@UseGuards(JwtAuthGuard, ResourceMemberGuard, FeatureFlagGuard)
@FeatureFlag(FLAGS.SEARCH)
export class SearchController {
  constructor(private search: SearchService) {}

  /**
   * §G03-6 — somebody opened a search result.
   *
   * Its own endpoint rather than a side effect of the search call: what makes
   * a thing trending is being OPENED, not being returned. Counting appearances
   * would rank whatever the index happens to match most often, which is a
   * measure of the query and not of anybody's interest.
   */
  @Post(':workspaceId/opened')
  @UseGuards(ResourceMemberGuard)
  async recordOpen(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { entityType?: string; entityId?: string },
  ) {
    return this.search.recordOpen(workspaceId, user.id, body?.entityType ?? '', body?.entityId ?? '')
  }

  /**
   * §G02-9 — the sources this workspace can search, and which are connected.
   *
   * Declared BEFORE `:workspaceId`, or Nest reads "sources" as a workspace id
   * and answers 404 for a route that exists.
   */
  @Get('sources/:workspaceId')
  @UseGuards(ResourceMemberGuard)
  async sources(@Param('workspaceId') workspaceId: string, @CurrentUser() user: { id: string }) {
    return this.search.listSources(workspaceId, user.id)
  }

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
    @Query('creatorId') creatorId?: string,
    @Query('includeArchived') includeArchived?: string,
    @Query('labelId') labelId?: string,
    @Query('taskTypeId') taskTypeId?: string,
    @Query('dueAfter') dueAfter?: string,
    @Query('dueBefore') dueBefore?: string,
    // §2 [04:00] — when it was made, as distinct from when it is due.
    @Query('createdAfter') createdAfter?: string,
    @Query('createdBefore') createdBefore?: string,
    // §2 [02:35] — Location: which space, or which list.
    @Query('spaceId') spaceId?: string,
    @Query('folderId') folderId?: string,
    @Query('listId') listId?: string,
    @Query('customFieldId') customFieldId?: string,
    @Query('customFieldValue') customFieldValue?: string,
    @Query('sort') sort?: string,
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
    if (creatorId) filters.creatorId = creatorId
    if (includeArchived === 'true') filters.includeArchived = true
    if (labelId) filters.labelId = labelId
    // §1.1 — she filters search by type as well as choosing one at create time.
    if (taskTypeId) filters.taskTypeId = taskTypeId
    /*
     * §G03-6 — the two engagement modes join the whitelist.
     *
     * Whitelisted rather than passed through, like every other filter here: an
     * unrecognised name has to be DROPPED, because a sort the service does not
     * know silently returns relevance and reads as "the control did nothing".
     */
    if (sort === 'updated' || sort === 'created' || sort === 'trending' || sort === 'trending_me') {
      filters.sort = sort
    }
    const parseDate = (s?: string) => {
      if (!s) return undefined
      const d = new Date(s)
      return Number.isNaN(d.getTime()) ? undefined : d
    }
    filters.dueAfter = parseDate(dueAfter)
    filters.dueBefore = parseDate(dueBefore)
    filters.createdAfter = parseDate(createdAfter)
    filters.createdBefore = parseDate(createdBefore)
    if (spaceId) filters.spaceId = spaceId
    if (folderId) filters.folderId = folderId
    if (listId) filters.listId = listId
    // Custom-field value filter — only applied when both the field and a
    // non-empty value are supplied (Plan §11.2).
    if (customFieldId && customFieldValue != null && customFieldValue !== '') {
      filters.customFieldId = customFieldId
      filters.customFieldValue = customFieldValue
    }
    return this.search.search(workspaceId, user.id, q ?? '', limit ? Number(limit) : 10, filters)
  }

  @Get(':workspaceId/custom-fields')
  customFields(@Param('workspaceId') workspaceId: string) {
    return this.search.listWorkspaceCustomFields(workspaceId)
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
