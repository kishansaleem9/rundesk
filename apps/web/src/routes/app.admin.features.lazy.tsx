import { createLazyFileRoute } from '@tanstack/react-router'
import { FeatureFlagsPanel } from '../pages/admin-features-page'

export const Route = createLazyFileRoute('/app/admin/features')({
  component: FeatureFlagsPanel,
})
