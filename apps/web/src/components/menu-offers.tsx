import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

/**
 * `true` offered, `false` refused (the row is not drawn), `null` still being
 * asked (the row is drawn disabled).
 */
export type Offer = boolean | null
export type MenuOffers = { manage: Offer; delete: Offer }

/**
 * THE MENU OFFERS WHAT ITS ROUTES WOULD ACCEPT.
 *
 * Rendered inside a menu's content, so its question is asked when the menu
 * opens: the item's capabilities, which the API answers with the very checks
 * its routes ask (`GET /spaces/:id/capabilities`, the folder's, the list's,
 * the project's). The sidebar offered Delete on every space, folder, project
 * and list to everyone, and the API refused most of them
 * (found-28-sep/delete-and-public-link-offered-to-everyone).
 *
 * If the question itself fails, the rows are offered and the route answers
 * for itself — a disabled row nobody can ever enable is the dead control this
 * replaces.
 */
export function WithMenuOffers({
  path,
  read = (data) => ({ manage: data.manage === true, delete: data.delete === true }),
  children,
}: {
  path: string
  /** How this kind's answer maps onto the rows (a project says `edit` and `archive`). */
  read?: (data: Record<string, unknown>) => { manage: boolean; delete: boolean }
  children: (offers: MenuOffers) => ReactNode
}) {
  const q = useQuery({
    queryKey: ['menu-offers', path],
    queryFn: () => api<Record<string, unknown>>(path),
    staleTime: 30_000,
  })
  const offers: MenuOffers = q.isError
    ? { manage: true, delete: true }
    : q.data
      ? read(q.data)
      : { manage: null, delete: null }
  return <>{children(offers)}</>
}
