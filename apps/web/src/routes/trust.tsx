import { createFileRoute } from '@tanstack/react-router'
import { TrustPage } from '../pages/trust-page'

export const Route = createFileRoute('/trust')({
  component: TrustPage,
})
