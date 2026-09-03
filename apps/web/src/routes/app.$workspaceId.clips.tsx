import { createFileRoute } from '@tanstack/react-router'

/*
 * §G07-5 frame `087_0535` — "Record a Clip" and "Talk to Text" are two entries
 * in Personal Tools, and the top bar offers both as pinnable icons.
 *
 * They pointed at `/clips` and `/clips?kind=audio`, and nothing ever read the
 * parameter — so pinning both gave you two different icons that opened the
 * identical page. Whitelisted here rather than read raw in the page, so an
 * unrecognised value falls back to "everything" instead of filtering to
 * nothing and reading as an empty library.
 */
const KINDS = ['audio', 'video'] as const

export const Route = createFileRoute('/app/$workspaceId/clips')({
  validateSearch: (search: Record<string, unknown>): { kind?: (typeof KINDS)[number] } => ({
    kind: (KINDS as readonly string[]).includes(search.kind as string)
      ? (search.kind as (typeof KINDS)[number])
      : undefined,
  }),
})
