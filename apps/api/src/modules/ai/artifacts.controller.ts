import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { NamedWorkspaceMemberGuard } from '../auth/guards/named-workspace-member.guard'
import { PlanFeatureGuard } from '../plans/plan-feature.guard'
import { RequirePlan } from '../plans/require-plan.decorator'
import { PUBLIC_ROUTE_LIMITS, RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AiService } from './ai.service'
import { ArtifactsService, parseDeck } from './artifacts.service'

/**
 * WHAT BRAIN MADE (`ledger-rows/row-853`): the asker's own decks, opened, asked
 * to change, taken back to an earlier version, published to a link and deleted.
 * Under the AI's own gates, as every route of `AiController` is.
 */
@ApiTags('ai')
@ApiBearerAuth()
@RequirePlan('ai')
@UseGuards(JwtAuthGuard, NamedWorkspaceMemberGuard, PlanFeatureGuard)
@Controller('ai/artifacts')
export class ArtifactsController {
  constructor(
    private readonly artifacts: ArtifactsService,
    private readonly ai: AiService,
  ) {}

  @Get()
  list(@CurrentUser() user: { id: string }, @Query('workspaceId') workspaceId?: string) {
    if (!workspaceId) throw new HttpException('Say which workspace', HttpStatus.BAD_REQUEST)
    return this.artifacts.listMine(workspaceId, user.id)
  }

  @Get(':id')
  get(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.artifacts.getMine(id, user.id)
  }

  /**
   * ClickUp changes an Artifact by asking again, and the whole of it is made
   * anew: what was asked goes to the model with the deck as it is, and what
   * comes back is checked as a typed deck would be, then kept as a new version.
   */
  @Post(':id/revise')
  async revise(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() body: { instruction?: string }) {
    const instruction = typeof body?.instruction === 'string' ? body.instruction.trim() : ''
    if (!instruction) throw new HttpException('Say what to change', HttpStatus.BAD_REQUEST)
    if (instruction.length > 2000) throw new HttpException('Say what to change in at most 2000 characters', HttpStatus.BAD_REQUEST)
    const current = await this.artifacts.getMine(id, user.id)
    const answer = await this.ai.reviseDeck({ title: current.title, slides: current.slides }, instruction, { userId: user.id, workspaceId: current.workspaceId })
    const parsed = parseDeck(answer)
    if (!parsed.ok) throw new HttpException(`Brain did not make a deck from that — ${parsed.reason}`, HttpStatus.BAD_GATEWAY)
    return this.artifacts.addVersion(id, user.id, parsed.deck, instruction)
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() body: { version?: number }) {
    const version = Number(body?.version)
    if (!Number.isInteger(version) || version < 1) throw new HttpException('Say which version', HttpStatus.BAD_REQUEST)
    return this.artifacts.restore(id, user.id, version)
  }

  @Post(':id/publish')
  publish(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.artifacts.publish(id, user.id)
  }

  @Delete(':id/publish')
  unpublish(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.artifacts.unpublish(id, user.id)
  }

  @Delete(':id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.artifacts.remove(id, user.id)
  }
}

/** A published deck, for anybody with its link — read-only, and limited per address as every public page is. */
@ApiTags('ai')
@Controller()
@UseGuards(RateLimitGuard)
export class ArtifactsPublicController {
  constructor(private readonly artifacts: ArtifactsService) {}

  @Get('public/artifacts/:token')
  @RateLimit(PUBLIC_ROUTE_LIMITS.page)
  read(@Param('token') token: string) {
    return this.artifacts.readPublished(token)
  }
}
