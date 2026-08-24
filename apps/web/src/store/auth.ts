import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type AuthUser = {
  id: string
  email: string
  displayName: string
  role: string
  avatarUrl?: string | null
  /** §1.5 — top-bar controls this member has put away (lib/topbar-prefs). */
  topbarHidden?: string[] | null
  /** §6 — the tools pinned to the top bar. null = never chosen. */
  topbarPinned?: string[] | null
}

export type AuthOrg = {
  id: string
  name: string
  slug: string
  role: string
}

export type AuthWorkspace = {
  id: string
  name: string
  slug: string
  organizationId: string
  role: string
}

export type AuthState = {
  user: AuthUser | null
  organizations: AuthOrg[]
  workspaces: AuthWorkspace[]
  accessToken: string | null
  refreshToken: string | null
  setSession: (
    user: AuthUser, 
    accessToken: string, 
    refreshToken: string, 
    organizations?: AuthOrg[], 
    workspaces?: AuthWorkspace[]
  ) => void
  setAccessToken: (accessToken: string) => void
  setUser: (user: AuthUser) => void
  setOrganizations: (orgs: AuthOrg[]) => void
  setWorkspaces: (workspaces: AuthWorkspace[]) => void
  clear: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      organizations: [],
      workspaces: [],
      accessToken: null,
      refreshToken: null,
      setSession: (user, accessToken, refreshToken, organizations = [], workspaces = []) =>
        set({ user, accessToken, refreshToken, organizations, workspaces }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      setOrganizations: (organizations) => set({ organizations }),
      setWorkspaces: (workspaces) => set({ workspaces }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null, organizations: [], workspaces: [] }),
      // Auth is now anchored on the httpOnly session cookie, not a persisted
      // token. We treat the presence of a hydrated user profile as "logged in"
      // (the route guard reads this synchronously); the cookie is what actually
      // authenticates each request, and GET /users/me on load confirms it.
      isAuthenticated: () => !!get().user,
    }),
    {
      name: 'rundesk.auth',
      storage: createJSONStorage(() => localStorage),
      // Persist only the user profile + memberships — NOT the raw tokens. The
      // access/refresh tokens live in httpOnly cookies now. (Existing users who
      // still have tokens in localStorage keep them in memory after rehydration
      // for a graceful Bearer transition; they're dropped on the next write.)
      partialize: (s) => ({
        user: s.user,
        organizations: s.organizations,
        workspaces: s.workspaces,
      }),
    },
  ),
)
