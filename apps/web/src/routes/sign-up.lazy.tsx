import { createLazyFileRoute } from '@tanstack/react-router'
import { SignUpWizard } from '../pages/sign-up-page'

export const Route = createLazyFileRoute('/sign-up')({
  component: SignUpWizard,
})
