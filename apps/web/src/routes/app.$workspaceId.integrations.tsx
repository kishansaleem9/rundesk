import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/$workspaceId/integrations')({
  // The app to open the catalogue at. The palette's Connect, for a search source
  // that is not connected, names the source's own app, so the person lands on
  // the tile that connects it rather than on eighty others.
  validateSearch: (search: Record<string, unknown>): { app?: string } => ({
    app: typeof search.app === 'string' && /^[a-z0-9-]{1,40}$/.test(search.app) ? search.app : undefined,
  }),
})
