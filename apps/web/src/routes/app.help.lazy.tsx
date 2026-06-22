import { createLazyFileRoute } from '@tanstack/react-router'
import { HelpPage } from '../pages/app-help-page'

export const Route = createLazyFileRoute('/app/help')({
  component: HelpPage,
})
