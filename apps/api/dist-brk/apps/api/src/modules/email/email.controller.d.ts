import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
export declare class EmailController {
    private readonly emailService;
    private readonly config;
    constructor(emailService: EmailService, config: ConfigService);
    sendTestEmail(body: {
        to: string;
        subject?: string;
        html?: string;
    }): Promise<{
        ok: boolean;
    }>;
}
