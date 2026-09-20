import { ConfigService } from '@nestjs/config';
export declare class EmailService {
    private config;
    private readonly logger;
    private readonly transport;
    private readonly from;
    private readonly nodeEnv;
    constructor(config: ConfigService);
    private esc;
    /** Send an invitation email */
    sendInvitationEmail(opts: {
        to: string;
        inviter: string;
        orgName: string;
        claimUrl: string;
        expiresAt: Date;
    }): Promise<void>;
    /**
     * Someone was given access to a specific space / folder / project / list /
     * task / doc. Sent to workspace members and to outsiders alike — an outsider
     * lands on the sign-up page and their pending grant is claimed on signup.
     */
    sendShareInviteEmail(opts: {
        to: string;
        inviter: string;
        objectType: string;
        objectName: string;
        level: string;
        url: string;
        isOutsider?: boolean;
    }): Promise<void>;
    /** Send a plain test email for provider verification */
    sendTestEmail(opts: {
        to: string;
        subject?: string;
        html?: string;
    }): Promise<void>;
    /** Send a password reset email */
    sendPasswordResetEmail(opts: {
        to: string;
        recipientName?: string;
        resetUrl: string;
        expiresAt: Date;
    }): Promise<void>;
    /** Send an email-verification link */
    sendVerificationEmail(opts: {
        to: string;
        recipientName?: string;
        verifyUrl: string;
        expiresAt: Date;
    }): Promise<void>;
    /** Send a task-assigned email */
    sendTaskAssigned(opts: {
        to: string;
        recipientName: string;
        actorName: string;
        taskTitle: string;
        taskUrl: string;
        workspaceName: string;
    }): Promise<void>;
    /** Send a mention email */
    sendMention(opts: {
        to: string;
        recipientName: string;
        actorName: string;
        context: string;
        taskTitle: string;
        taskUrl: string;
        workspaceName: string;
    }): Promise<void>;
    /** Send a due-soon reminder */
    sendDueSoon(opts: {
        to: string;
        recipientName: string;
        taskTitle: string;
        taskUrl: string;
        dueDateLabel: string;
        workspaceName: string;
    }): Promise<void>;
    /** Send an overdue reminder */
    sendOverdue(opts: {
        to: string;
        recipientName: string;
        taskTitle: string;
        taskUrl: string;
        workspaceName: string;
    }): Promise<void>;
    /** Send a task-comment-resolved notification */
    sendCommentResolved(opts: {
        to: string;
        recipientName: string;
        actorName: string;
        taskTitle: string;
        taskUrl: string;
        commentSnippet: string;
        workspaceName: string;
    }): Promise<void>;
    /** Send a task-commented notification */
    sendComment(opts: {
        to: string;
        recipientName: string;
        actorName: string;
        taskTitle: string;
        taskUrl: string;
        commentSnippet: string;
        workspaceName: string;
    }): Promise<void>;
    /** Send a clip share notification */
    sendClipSharedEmail(opts: {
        to: string;
        actorEmail: string;
        clipName: string;
        clipUrl: string;
        expiresAt: Date;
    }): Promise<void>;
    /** Send a generic activity notification email */
    sendActivity(opts: {
        to: string;
        recipientName: string;
        actorName: string;
        title: string;
        body?: string;
        taskUrl: string;
        workspaceName: string;
    }): Promise<void>;
    /** Send a periodic digest of unread notifications. */
    sendDigest(opts: {
        to: string;
        recipientName: string;
        frequency: 'daily' | 'weekly';
        total: number;
        groups: Array<{
            type: string;
            count: number;
            items: Array<{
                title: string;
                body: string | null;
                url: string | null;
            }>;
        }>;
        appUrl: string;
    }): Promise<void>;
    /**
     * Send a scheduled custom report (§9.5): a compact HTML summary table of the
     * top rows plus the full result as a CSV attachment. `columns[0]` is the group
     * column; the rest are metric columns already resolved to their display labels.
     */
    sendScheduledReport(opts: {
        to: string;
        reportName: string;
        frequency: 'daily' | 'weekly';
        groupLabel: string;
        columns: string[];
        rows: Array<Array<string | number>>;
        totalRows: number;
        generatedAt: string;
        csv: string;
        appUrl: string;
    }): Promise<void>;
    /**
     * Send a paid-invoice receipt (§14.1) with the branded PDF invoice attached.
     * Falls back to the dev-log path when SMTP is unconfigured, like every other
     * email. Delivery is app-side (in addition to Stripe's own emails); the
     * BillingService webhook guards against emailing the same invoice twice.
     */
    sendInvoicePaid(opts: {
        to: string;
        workspaceName: string;
        invoiceNumber: string;
        amountLabel: string;
        statusLabel: string;
        dateLabel: string;
        manageUrl: string;
        pdf: Buffer;
    }): Promise<void>;
    private send;
    private layout;
}
