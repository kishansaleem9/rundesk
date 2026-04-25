import type { FlagKey } from './registry'

export type FlagScope = 'global' | 'workspace' | 'role' | 'user'

export interface FlagOverride {
  flagKey: FlagKey
  scope: FlagScope
  scopeId: string | null  // null for global scope
  enabled: boolean
}

// Resolved flag set for a specific user — what the frontend receives at login
export interface ResolvedFlags {
  flags: Record<FlagKey, boolean>
  resolvedAt: number  // timestamp — lets client know when to re-fetch
}

export interface FlagResolutionContext {
  userId: string
  workspaceId: string
  role: string
}
