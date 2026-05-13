import { createLazyFileRoute } from '@tanstack/react-router'
import { FormBuilderPage } from '../pages/workspace-form-builder-page'

export const Route = createLazyFileRoute('/app/$workspaceId/forms/$formId')({
  component: FormBuilderPage,
})
