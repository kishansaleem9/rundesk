import { Body, Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { EmailService } from './email.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('email')
@Controller('email')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * A TEST MESSAGE, SENT FOR A SUPER ADMIN AND NOBODY ELSE
   * (`found-30-sep/test-email-route-open`).
   *
   * It sends any subject and any HTML to any address, from the product's own
   * sender. It had no guard: wherever `NODE_ENV` was not `production` it sent
   * for anybody, and lane 3 answered an anonymous `{}` with 201. A staging
   * deployment with a mail key was an open relay for the product's name.
   *
   * Now it is the super-admin console's, gated as the platform routes are
   * (`OpsController`, `OrganizationsController`): a session first, so an
   * anonymous caller is refused 401 before the body is read, then the
   * platform role, so an ordinary member is refused 403. Production still
   * refuses everybody, as it did.
   */
  @Post('test')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a test email (super admin; not in production)' })
  async sendTestEmail(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { to: string; subject?: string; html?: string },
  ) {
    if (user?.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development'
    if (nodeEnv === 'production') {
      throw new ForbiddenException('Test email endpoint is disabled in production')
    }

    await this.emailService.sendTestEmail({
      to: body.to,
      subject: body.subject,
      html: body.html,
    })
    return { ok: true }
  }
}
