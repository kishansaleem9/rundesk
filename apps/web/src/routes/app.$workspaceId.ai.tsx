import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/$workspaceId/ai')({
  // §A2.3 — a question asked somewhere else has to survive the jump here,
  // otherwise the user retypes it.
  validateSearch: (search: Record<string, unknown>): { prompt?: string } => ({
    prompt: typeof search.prompt === 'string' && search.prompt.trim() ? search.prompt : undefined,
  }),
})
