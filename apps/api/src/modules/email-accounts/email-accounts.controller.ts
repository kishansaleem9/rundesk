import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { EmailAccountsService } from './email-accounts.service'

type User = { id: string; role?: string | null }

/**
 * ClickUp's Email settings (`found-9-oct/task-email-sends-from-the-server`):
 * the mailboxes linked to send a task's email from, a person's signatures and
 * the workspace's templates. Every route asks the service's gate — a member,
 * not a guest, with the Email ClickApp on — and each its own rule.
 */
@ApiTags('email-accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId')
export class EmailAccountsController {
  constructor(private readonly accounts: EmailAccountsService) {}

  @Get('email-accounts')
  @ApiOperation({ summary: 'The Email settings: mailboxes, signatures, templates and what the plan gives' })
  overview(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @CurrentUser() user: User) {
    return this.accounts.overview(workspaceId, user)
  }

  @Post('email-accounts/connect/:provider')
  @ApiOperation({ summary: "Link a Gmail or Outlook mailbox: the provider's consent page" })
  connect(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('provider') provider: string, @CurrentUser() user: User) {
    return this.accounts.connect(workspaceId, user, provider)
  }

  @Post('email-accounts/imap')
  @ApiOperation({ summary: 'Link a mailbox by its IMAP and SMTP servers and its password, as ClickUp’s "Sign in with IMAP"' })
  linkImap(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @CurrentUser() user: User, @Body() body: Record<string, unknown>) {
    return this.accounts.linkImap(workspaceId, user, body && typeof body === 'object' ? body : {})
  }

  @Patch('email-accounts/:accountId')
  @ApiOperation({ summary: 'A mailbox’s sender name, and who besides its owner may send from it' })
  update(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('accountId') accountId: string,
    @CurrentUser() user: User,
    @Body() body: { senderName?: unknown; senders?: unknown },
  ) {
    return this.accounts.updateAccount(workspaceId, accountId, user, body ?? {})
  }

  @Delete('email-accounts/:accountId')
  @ApiOperation({ summary: 'Remove a mailbox' })
  remove(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('accountId') accountId: string, @CurrentUser() user: User) {
    return this.accounts.removeAccount(workspaceId, accountId, user)
  }

  @Post('email-signatures')
  createSignature(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @CurrentUser() user: User, @Body() body: { name?: unknown; body?: unknown; isDefault?: unknown }) {
    return this.accounts.saveSignature(workspaceId, user, null, body ?? {})
  }

  @Patch('email-signatures/:signatureId')
  updateSignature(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('signatureId') signatureId: string,
    @CurrentUser() user: User,
    @Body() body: { name?: unknown; body?: unknown; isDefault?: unknown },
  ) {
    return this.accounts.saveSignature(workspaceId, user, signatureId, body ?? {})
  }

  @Delete('email-signatures/:signatureId')
  deleteSignature(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('signatureId') signatureId: string, @CurrentUser() user: User) {
    return this.accounts.deleteSignature(workspaceId, user, signatureId)
  }

  @Post('email-templates')
  createTemplate(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: User,
    @Body() body: { name?: unknown; subject?: unknown; body?: unknown; shared?: unknown },
  ) {
    return this.accounts.saveTemplate(workspaceId, user, null, body ?? {})
  }

  @Patch('email-templates/:templateId')
  updateTemplate(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('templateId') templateId: string,
    @CurrentUser() user: User,
    @Body() body: { name?: unknown; subject?: unknown; body?: unknown; shared?: unknown },
  ) {
    return this.accounts.saveTemplate(workspaceId, user, templateId, body ?? {})
  }

  @Delete('email-templates/:templateId')
  deleteTemplate(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('templateId') templateId: string, @CurrentUser() user: User) {
    return this.accounts.deleteTemplate(workspaceId, user, templateId)
  }
}
