import { useQuery } from '@tanstack/react-query'
import { api } from './api'

/**
 * §V2-06 — what a space's ClickApps actually DO.
 *
 * Frame `07:19` is a grid of switches. A grid of switches that writes a column
 * nobody reads is the facade this codebase has spent two videos removing — the
 * Photos tab that returned CSS gradients, the AI tab wired to nothing, the
 * "Upload" with no file input. So every key here has a read site, and a switch
 * with no read site is not offered.
 *
 * DEFAULTS TO ON, ALWAYS. `features` is null on every space made before the
 * column existed, and an absent key has to mean "on" — the alternative is that
 * shipping this hides Priority from every existing space in every existing
 * workspace, which is not a feature, it is an outage.
 */

export const SPACE_FEATURE_KEYS = [
  'priority',
  'tags',
  'customFields',
  'milestones',
  'wipLimits',
  'listEmail',
] as const

export type SpaceFeatureKey = (typeof SPACE_FEATURE_KEYS)[number]
export type SpaceFeatures = Record<SpaceFeatureKey, boolean>

/** Every switch on — the answer for a space that predates the column, and the
 *  default for anything rendered outside a provider. */
export const ALL_SPACE_FEATURES: SpaceFeatures = Object.fromEntries(
  SPACE_FEATURE_KEYS.map((k) => [k, true]),
) as SpaceFeatures

type SpaceRow = { id: string; features?: Record<string, boolean> | null }

/**
 * The space's switches, or every one of them on.
 *
 * Reads the same `['spaces', workspaceId]` cache the list route already keeps
 * for `viewConfig`, so this costs no extra request on the screen that needs it
 * most. While that query is still loading it answers ALL ON — a list that
 * flashes its Priority column away and back on every navigation is worse than
 * one that never hides it.
 */
export function useSpaceFeatures(workspaceId: string, spaceId: string | undefined): SpaceFeatures {
  const { data } = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<SpaceRow[]>(`/spaces/workspace/${workspaceId}`),
    enabled: !!workspaceId,
  })
  const stored = spaceId ? data?.find((s) => s.id === spaceId)?.features : null
  if (!stored) return ALL_SPACE_FEATURES
  // Merged over ALL_SPACE_FEATURES rather than used directly: a stored map written before a
  // new feature key existed must not read as "that new feature is off".
  return { ...ALL_SPACE_FEATURES, ...stored } as SpaceFeatures
}
