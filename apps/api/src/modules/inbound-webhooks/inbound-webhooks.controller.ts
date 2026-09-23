import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common'
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { InboundWebhooksService } from './inbound-webhooks.service'
import { GitCommitLinksService } from './git-commit-links.service'
import { ZoomRecordingsService } from './zoom-recordings.service'
import type { GitProvider } from './git-commit-links.util'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('inbound-webhooks')
@ApiBearerAuth()
@Controller('lists/:listId/inbound-webhooks')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class InboundWebhooksController {
  constructor(private readonly hooks: InboundWebhooksService) {}

  @Get()
  list(@Param('listId') listId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.hooks.listForList(listId, { id: user.id, role: user.role })
  }

  @Post()
  create(
    @Param('listId') listId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name?: string },
  ) {
    return this.hooks.create(listId, body?.name ?? '', user.id)
  }

  @Delete(':id')
  remove(@Param('listId') listId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.hooks.remove(id, listId, { id: user.id, role: user.role })
  }
}

// Public, unauthenticated receiver — external systems POST here with the token.
@ApiTags('inbound-webhooks')
@Controller('inbound/webhook')
export class InboundWebhookReceiverController {
  constructor(private readonly hooks: InboundWebhooksService) {}

  @Post(':token')
  receive(
    @Param('token') token: string,
    @Body() body: { title?: string; description?: string; priority?: string; dueDate?: string },
  ) {
    return this.hooks.receive(token, body ?? {})
  }
}

/**
 * §12.8 — public GitHub/GitLab **push** receiver. External VCS hosts POST push
 * events here; each commit message is scanned for a Rundesk task reference
 * (see git-commit-links.util) and auto-linked to the task (kind:'commit').
 *
 * Signature/secret verification (env-gated, degrades to permissive when the
 * secret env var is unset — matching the existing inbound-email receiver):
 *   • GitHub → HMAC-SHA256 of the RAW body under `GITHUB_WEBHOOK_SECRET`,
 *     compared to `X-Hub-Signature-256`.
 *   • GitLab → the `X-Gitlab-Token` header compared to `GITLAB_WEBHOOK_SECRET`.
 * The raw body is available because the app is bootstrapped with
 * `{ rawBody: true }` (see main.ts — the same mechanism the Stripe webhook uses).
 */
@ApiTags('inbound-webhooks')
@Controller('inbound/git')
export class InboundGitWebhookController {
  constructor(private readonly commitLinks: GitCommitLinksService) {}

  @Post(':provider')
  @ApiExcludeEndpoint()
  async receive(
    @Param('provider') providerRaw: string,
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('x-hub-signature-256') githubSignature: string | undefined,
    @Headers('x-gitlab-token') gitlabToken: string | undefined,
    @Headers('x-github-event') githubEvent: string | undefined,
    @Headers('x-gitlab-event') gitlabEvent: string | undefined,
    @Body() body: unknown,
  ) {
    const provider = this.assertGitProvider(providerRaw)
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}))

    if (provider === 'github') {
      this.verifyGithubSignature(raw, githubSignature)
      // GitHub sends a `ping` on hook creation and many non-push events; only
      // push carries commits to scan. Ack everything else with a no-op.
      if (githubEvent && githubEvent !== 'push') return { ok: true, event: githubEvent, linked: 0 }
    } else {
      this.verifyGitlabToken(gitlabToken)
      if (gitlabEvent && gitlabEvent !== 'Push Hook') return { ok: true, event: gitlabEvent, linked: 0 }
    }

    return this.commitLinks.ingestPush(provider, body)
  }

  private assertGitProvider(raw: string): GitProvider {
    if (raw === 'github' || raw === 'gitlab') return raw
    throw new BadRequestException(`Unsupported git provider: ${raw}`)
  }

  private verifyGithubSignature(raw: Buffer, signature: string | undefined): void {
    const secret = process.env.GITHUB_WEBHOOK_SECRET
    if (!secret) return // intentionally permissive when unset (dev / local)
    if (!signature) throw new UnauthorizedException('Missing X-Hub-Signature-256 header')
    const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('GitHub webhook signature mismatch')
    }
  }

  private verifyGitlabToken(token: string | undefined): void {
    const secret = process.env.GITLAB_WEBHOOK_SECRET
    if (!secret) return // intentionally permissive when unset (dev / local)
    if (!token) throw new UnauthorizedException('Missing X-Gitlab-Token header')
    // Constant-time compare of equal-length digests (avoids leaking length).
    const a = createHmac('sha256', secret).update(token).digest()
    const b = createHmac('sha256', secret).update(secret).digest()
    if (!timingSafeEqual(a, b)) throw new UnauthorizedException('GitLab webhook token mismatch')
  }
}

/**
 * §12.9 — public Zoom event receiver. Handles the one-time `endpoint.url_validation`
 * challenge and the `recording.completed` event: on the latter we fetch the
 * meeting's cloud recording and attach its share URL to the linked task(s).
 *
 * Signature verification (env-gated on `ZOOM_WEBHOOK_SECRET_TOKEN`): Zoom signs
 * `v0:<timestamp>:<raw body>` with HMAC-SHA256 and sends it as `x-zm-signature`.
 */
@ApiTags('inbound-webhooks')
@Controller('inbound/zoom')
export class InboundZoomWebhookController {
  constructor(private readonly recordings: ZoomRecordingsService) {}

  @Post()
  @ApiExcludeEndpoint()
  async receive(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('x-zm-signature') signature: string | undefined,
    @Headers('x-zm-request-timestamp') timestamp: string | undefined,
    @Body() body: { event?: string; payload?: { plainToken?: string } },
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}))

    // Zoom's endpoint validation: echo back plainToken + its HMAC. Returned
    // before signature verification because the challenge itself carries none.
    if (body?.event === 'endpoint.url_validation') {
      const plainToken = body.payload?.plainToken ?? ''
      const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? ''
      return {
        plainToken,
        encryptedToken: createHmac('sha256', secret).update(plainToken).digest('hex'),
      }
    }

    this.verifyZoomSignature(raw, signature, timestamp)

    if (body?.event === 'recording.completed') {
      return this.recordings.handleRecordingCompleted(body)
    }
    return { ok: true, event: body?.event ?? null }
  }

  private verifyZoomSignature(
    raw: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ): void {
    const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN
    if (!secret) return // intentionally permissive when unset (dev / local)
    if (!signature || !timestamp) throw new UnauthorizedException('Missing Zoom signature headers')
    const message = `v0:${timestamp}:${raw.toString('utf8')}`
    const expected = `v0=${createHmac('sha256', secret).update(message).digest('hex')}`
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Zoom webhook signature mismatch')
    }
  }
}
