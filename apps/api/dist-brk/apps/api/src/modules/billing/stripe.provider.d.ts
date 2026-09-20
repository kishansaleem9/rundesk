import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
/**
 * DI token for the Stripe SDK client. Resolves to `null` when STRIPE_SECRET_KEY
 * is not set, so BillingService can degrade gracefully ("billing not configured")
 * instead of throwing at construction time. Tests inject a fake in its place.
 */
export declare const STRIPE_CLIENT = "STRIPE_CLIENT";
export declare const stripeClientProvider: {
    provide: string;
    inject: (typeof ConfigService)[];
    useFactory: (config: ConfigService) => Stripe | null;
};
