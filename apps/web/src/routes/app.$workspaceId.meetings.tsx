import { createFileRoute } from '@tanstack/react-router'

/*
 * §G14-15 — a meeting you can link to.
 *
 * Meetings rendered only as rows in a list, so there was no way to point at
 * one. That mattered the moment search learned to return them: a hit whose URL
 * is just the meetings page lands you among two hundred rows and leaves you to
 * find it yourself, which is the difference between search finding something
 * and search taking you to it.
 */
export const Route = createFileRoute('/app/$workspaceId/meetings')({
  validateSearch: (search: Record<string, unknown>): { meeting?: string } => ({
    meeting: typeof search.meeting === 'string' && search.meeting ? search.meeting : undefined,
  }),
})
