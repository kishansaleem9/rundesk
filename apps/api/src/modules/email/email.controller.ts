import { Body, Controller, ForbiddenException, Post } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { EmailService } from './email.service'

@ApiTags('email')
@Controller('email')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  @Post('test')
  @ApiOperation({ summary: 'Send a test email via Resend (non-production only)' })
  async sendTestEmail(
    @Body() body: { to: string; subject?: string; html?: string },
  ) {
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
