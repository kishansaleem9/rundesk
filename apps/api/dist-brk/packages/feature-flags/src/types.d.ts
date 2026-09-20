import type { FlagKey } from './registry';
export type FlagScope = 'global' | 'workspace' | 'role' | 'user';
export interface FlagOverride {
    flagKey: FlagKey;
    scope: FlagScope;
    scopeId: string | null;
    enabled: boolean;
}
export interface ResolvedFlags {
    flags: Record<FlagKey, boolean>;
    resolvedAt: number;
}
export interface FlagResolutionContext {
    userId: string;
    workspaceId: string;
    role: string;
}
