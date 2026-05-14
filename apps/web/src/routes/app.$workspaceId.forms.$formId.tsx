import { createFileRoute } from '@tanstack/react-router'

export type FormBuilderTab = 'builder' | 'settings' | 'submissions'

export const Route = createFileRoute('/app/$workspaceId/forms/$formId')({
  validateSearch: (search: Record<string, unknown>): { tab?: FormBuilderTab } => ({
    tab:
      search.tab === 'submissions' || search.tab === 'settings' || search.tab === 'builder'
        ? search.tab
        : undefined,
  }),
})
