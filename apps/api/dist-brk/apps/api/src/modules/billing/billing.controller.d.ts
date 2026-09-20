import { BillingService } from './billing.service';
/**
 * Workspace-scoped billing endpoints (Plan §14.1). Checkout + Portal mutate the
 * commercial subscription and are admin-gated (WorkspaceAdminGuard = workspace
 * admin / manager / super admin); the read-only status is member-gated. The
 * unauthenticated Stripe webhook lives in BillingWebhookController.
 */
export declare class BillingController {
    private readonly billing;
    constructor(billing: BillingService);
    checkout(workspaceId: string, body: {
        tier: string;
    }): Promise<{
        url: string;
    }>;
    portal(workspaceId: string): Promise<{
        url: string;
    }>;
    status(workspaceId: string): Promise<{
        configured: boolean;
        plan: {
            id: "enterprise" | "free" | "pro" | "business";
            label: string;
        };
        subscription: {
            id: string;
            workspaceId: string;
            stripeSubscriptionId: string;
            status: string;
            tier: string;
            currentPeriodEnd: Date | null;
            cancelAtPeriodEnd: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
        invoices: {
            id: string;
            workspaceId: string;
            stripeInvoiceId: string;
            amount: number;
            currency: string;
            status: string;
            hostedUrl: string | null;
            pdfUrl: string | null;
            createdAt: Date;
        }[];
    }>;
}
