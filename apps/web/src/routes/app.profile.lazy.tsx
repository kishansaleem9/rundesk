import { createLazyFileRoute } from '@tanstack/react-router'
import { ProfilePage } from '../pages/app-profile-page'

export const Route = createLazyFileRoute('/app/profile')({
  component: ProfilePage,
})
