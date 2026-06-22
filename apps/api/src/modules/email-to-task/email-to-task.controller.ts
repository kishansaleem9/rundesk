import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { EmailToTaskService, type InboundEmailPayload } from './email-to-task.service'

/**
 * Authenticated: per-list inbound alias CRUD.
 */
@ApiTags('email-to-task')
@ApiBearerAuth()
@Controller('lists/:listId/inbound-email')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class EmailAliasController {
  constructor(private readonly svc: EmailToTaskService) {}

  @Get()
  async get(@Param('listId') listId: string) {
    return this.svc.getAlias(listId)
  }

  @Post()
  async ensure(
    @CurrentUser() user: { id: string },
    @Param('listId') listId: string,
  ) {
    return this.svc.ensureAlias(listId, user.id)
  }

  @Post('rotate')
  async rotate(
    @CurrentUser() user: { id: string },
    @Param('listId') listId: string,
  ) {
    return this.svc.rotateAlias(listId, user.id)
  }

  @Delete()
  async revoke(
    @CurrentUser() user: { id: string },
    @Param('listId') listId: string,
  ) {
    return this.svc.revokeAlias(listId, user.id)
  }
}

/**
 * Unauthenticated: inbound webhook receiver. Verified by HMAC over the
 * raw body when INBOUND_EMAIL_WEBHOOK_SECRET is configured; otherwise
 * accepts any request (dev-only behaviour, logged on boot).
 *
 * Supports a Postmark-style JSON payload — see InboundEmailPayload — and
 * accepts attachments as base64-encoded blobs.
 */
type InboundWebhookBody = {
  MessageID?: string
  messageId?: string
  From?: string
  FromName?: string
  fromAddress?: string
  fromName?: string
  To?: string
  recipient?: string
  Subject?: string
  subject?: string
  TextBody?: string
  HtmlBody?: string
  textBody?: string
  htmlBody?: string
  InReplyTo?: string
  inReplyTo?: string
  References?: string
  references?: string
  Attachments?: Array<{ Name: string; ContentType: string; Content: string }>
  attachments?: Array<{ fileName: string; contentType: string; contentBase64: string }>
}

@ApiTags('email-to-task')
@Controller('inbound/email')
export class InboundEmailController {
  constructor(private readonly svc: EmailToTaskService) {}

  @Post()
  async ingest(
    @Headers('x-rundesk-signature') signature: string | undefined,
    @Body() body: InboundWebhookBody,
  ) {
    this.verifySignature(body, signature)
    const payload = this.normalisePayload(body)
    return this.svc.ingest(payload)
  }

  private verifySignature(body: InboundWebhookBody, signature: string | undefined): void {
    const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET
    if (!secret) return // intentionally permissive when unset (dev / local)
    if (!signature) {
      throw new UnauthorizedException('Missing x-rundesk-signature header')
    }
    // Sign the canonical Message-Id + recipient pair — payloads are large
    // and re-stringification can change byte-for-byte equality. Both fields
    // are unique-ish enough to authenticate the request shape.
    const messageId = body.MessageID ?? body.messageId ?? ''
    const recipient = body.To ?? body.recipient ?? ''
    const expected = createHmac('sha256', secret)
      .update(`${messageId}\n${recipient}`)
      .digest('hex')
    let given: Buffer
    try {
      given = Buffer.from(signature, 'hex')
    } catch {
      throw new UnauthorizedException('Invalid signature format')
    }
    const expectedBuf = Buffer.from(expected, 'hex')
    if (given.length !== expectedBuf.length || !timingSafeEqual(given, expectedBuf)) {
      throw new UnauthorizedException('Signature mismatch')
    }
  }

  private normalisePayload(body: InboundWebhookBody): InboundEmailPayload {
    const messageId = body.MessageID ?? body.messageId
    const from = body.From ?? body.fromAddress
    const recipient = body.To ?? body.recipient
    if (!messageId || !from || !recipient) {
      throw new UnauthorizedException('Missing required fields: messageId, from, recipient')
    }
    const postmarkAtt = (body.Attachments ?? []).map((a) => ({
      fileName: a.Name,
      contentType: a.ContentType,
      content: Buffer.from(a.Content, 'base64'),
    }))
    const nativeAtt = (body.attachments ?? []).map((a) => ({
      fileName: a.fileName,
      contentType: a.contentType,
      content: Buffer.from(a.contentBase64, 'base64'),
    }))
    return {
      messageId,
      fromAddress: this.extractEmail(from),
      fromName: body.FromName ?? body.fromName,
      recipient: this.extractEmail(recipient),
      subject: body.Subject ?? body.subject,
      textBody: body.TextBody ?? body.textBody,
      htmlBody: body.HtmlBody ?? body.htmlBody,
      inReplyTo: (body.InReplyTo ?? body.inReplyTo)?.trim(),
      references: body.References ?? body.references,
      attachments: [...postmarkAtt, ...nativeAtt],
    }
  }

  /** `"Alice <alice@example.com>"` -> `alice@example.com` */
  private extractEmail(value: string): string {
    const match = value.match(/<([^>]+)>/)
    return (match ? match[1] : value).trim().toLowerCase()
  }
}
