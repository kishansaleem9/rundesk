import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type AuthUser = {
  id: string
  email: string
  displayName: string
  role: string
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
      isAuthenticated: () => !!get().accessToken,
    }),
    {
      name: 'rundesk.auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        user: s.user,
        organizations: s.organizations,
        workspaces: s.workspaces,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
    },
  ),
)
