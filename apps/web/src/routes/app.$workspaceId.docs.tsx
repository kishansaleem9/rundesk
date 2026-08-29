import { createFileRoute } from '@tanstack/react-router'

/** A5.6 — the docs-hub buckets. Mirrors DOC_SCOPES in docs-panel.tsx. */
const SCOPES = ['all', 'mine', 'shared', 'archived'] as const

export const Route = createFileRoute('/app/$workspaceId/docs')({
  /*
   * `?doc=` was already the app's own link format — the docs panel writes
   * `/app/<ws>/docs?doc=<id>` into doc bodies, and the search indexer builds
   * the same URL — but the route declared nothing, so the panel had to read
   * the raw query string once at mount and never wrote it back. Which doc you
   * had open was therefore not an address: a reload put you on whichever doc
   * sorted first, and copying the address bar sent somebody the docs index.
   *
   * `scope` is the All / Mine / Shared / Archived rail, which had the same
   * problem for the same reason.
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): { doc?: string; scope?: (typeof SCOPES)[number] } => ({
    doc: typeof search.doc === 'string' && search.doc ? search.doc : undefined,
    // An unrecognised scope falls back to the default rather than asking the
    // API for a bucket it does not have.
    scope: (SCOPES as readonly string[]).includes(search.scope as string)
      ? (search.scope as (typeof SCOPES)[number])
      : undefined,
  }),
})
