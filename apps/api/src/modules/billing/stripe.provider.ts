import { ConfigService } from '@nestjs/config'
import Stripe from 'stripe'
import { readBillingConfig } from './billing.constants'

/**
 * DI token for the Stripe SDK client. Resolves to `null` when STRIPE_SECRET_KEY
 * is not set, so BillingService can degrade gracefully ("billing not configured")
 * instead of throwing at construction time. Tests inject a fake in its place.
 */
export const STRIPE_CLIENT = 'STRIPE_CLIENT'

export const stripeClientProvider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Stripe | null => {
    const { secretKey } = readBillingConfig((k) => config.get<string>(k))
    if (!secretKey) return null
    // No apiVersion override: pin to the version bundled with the installed SDK,
    // which keeps request/response types in sync with what we read below.
    return new Stripe(secretKey)
  },
}
