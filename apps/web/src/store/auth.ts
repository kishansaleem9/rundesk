import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type AuthUser = {
  id: string
  email: string
  displayName: string
  role: string
}

export type AuthState = {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  setSession: (user: AuthUser, accessToken: string, refreshToken: string) => void
  setAccessToken: (accessToken: string) => void
  clear: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setSession: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
      isAuthenticated: () => !!get().accessToken,
    }),
    {
      name: 'rundesk.auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
    },
  ),
)
