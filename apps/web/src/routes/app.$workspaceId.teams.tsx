import { createFileRoute } from '@tanstack/react-router'

/**
 * §V2-12, frame `20:55` — the Teams destination.
 *
 * NOT admin-gated, and that is the whole point of the item. The three things
 * this shows already existed inside workspace settings, whose route redirects
 * any non-admin back to `/app` — so an ordinary member could not see who was on
 * which team or who reported to whom. The APIs behind it were always readable
 * by any member; only the way in was missing.
 */
export const Route = createFileRoute('/app/$workspaceId/teams')({})
