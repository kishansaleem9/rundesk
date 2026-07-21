import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { FlagKey } from '@rundesk/feature-flags'

type ResolvedResponse = { flags: Record<string, boolean>; resolvedAt: number }

/**
 * §5 ClickApps — resolve a workspace's feature flags and expose a gate helper.
 *
 * Reuses the ['feature-flags','resolved', workspaceId] query cache. A workspace
 * admin toggling a feature invalidates the ['feature-flags','resolved'] prefix,
 * so every consumer (sidebar nav + settings tab) refetches and updates live.
 *
 * `featureEnabled` uses "on unless explicitly disabled" semantics: a flag counts
 * as enabled unless a workspace override has switched it off. This matches the
 * app's default (every feature visible), so gating only ever HIDES a feature an
 * admin deliberately turned off — it never hides one that was simply never in
 * the platform default set. While flags are still loading (or a flag is absent)
 * everything shows, avoiding a flash of missing navigation.
 */
export function useResolvedFlags(workspaceId?: string | null) {
  const query = useQuery({
    queryKey: ['feature-flags', 'resolved', workspaceId ?? null],
    queryFn: () =>
      api<ResolvedResponse>(
        `/feature-flags/resolved${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`,
      ),
    staleTime: 60_000,
  })
  const flags = query.data?.flags
  const featureEnabled = (flag?: FlagKey): boolean => {
    if (!flag) return true
    if (!flags) return true
    return flags[flag] !== false
  }
  return { flags, featureEnabled, isLoading: query.isLoading }
}
