import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ChatThreadsService } from './chat-threads.service'
import type { CurrentUserPayload } from '../tasks/types'

/**
 * §15 — the sidebar's "AI Chats" list.
 *
 * Under `workspaces/:workspaceId` with the membership guard, like every other
 * container in this codebase — including the routes addressing one thread by
 * id, so a stranger's id never reaches the service in the first place.
 */
@ApiTags('ai-chats')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/ai-chats')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class ChatThreadsController {
  constructor(private svc: ChatThreadsService) {}

  @Get()
  @ApiOperation({ summary: 'Your AI chats, newest first' })
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.list(workspaceId, user.id)
  }

  @Post()
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { skillId?: string },
  ) {
    return this.svc.create(workspaceId, user.id, body?.skillId)
  }

  @Get(':threadId')
  get(
    @Param('workspaceId') workspaceId: string,
    @Param('threadId') threadId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.get(workspaceId, user.id, threadId)
  }

  @Post(':threadId/messages')
  @ApiOperation({ summary: 'Append a turn; may return the thread’s new automatic title' })
  append(
    @Param('workspaceId') workspaceId: string,
    @Param('threadId') threadId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { role: 'user' | 'assistant'; content: string },
  ) {
    return this.svc.append(workspaceId, user.id, threadId, body)
  }

  @Patch(':threadId')
  rename(
    @Param('workspaceId') workspaceId: string,
    @Param('threadId') threadId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { title: string },
  ) {
    return this.svc.rename(workspaceId, user.id, threadId, body?.title ?? '')
  }

  @Delete(':threadId')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('threadId') threadId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.remove(workspaceId, user.id, threadId)
  }
}
