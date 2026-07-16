import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'

import '@rundesk/ui/styles.css'

import { routeTree } from './routeTree.gen'
import { queryClient } from './lib/query'
import { useAuthStore, type AuthUser } from './store/auth'
import { api } from './lib/api'
import { PwaInstallPrompt } from './components/pwa-install-prompt'
import { I18nProvider } from './lib/i18n'

const router = createRouter({
  routeTree,
  // The actual auth state is re-injected on every render via <RouterProvider context={…}>.
  // We seed with the current snapshot so the initial type is AuthState (not any/unknown).
  context: {
    auth: useAuthStore.getState(),
    queryClient,
  },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

/**
 * On load, if we have a persisted profile (so the route guard lets us in),
 * confirm the httpOnly cookie session is still valid and refresh the profile
 * via GET /users/me. If the cookie is gone/expired, api() runs a cookie-based
 * refresh and, on failure, clears the store — dropping the user back to /login.
 */
function useSessionHydration() {
  useEffect(() => {
    if (!useAuthStore.getState().isAuthenticated()) return
    let cancelled = false
    void api<AuthUser | null>('/users/me')
      .then((me) => {
        if (cancelled || !me) return
        useAuthStore.getState().setUser({
          id: me.id,
          email: me.email,
          displayName: me.displayName,
          role: me.role,
        })
      })
      .catch(() => {
        /* api() already attempted a refresh and cleared the store on failure */
      })
    return () => {
      cancelled = true
    }
  }, [])
}

function App() {
  const auth = useAuthStore()
  useSessionHydration()
  return (
    <>
      <RouterProvider router={router} context={{ auth, queryClient }} />
      <PwaInstallPrompt />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
)

