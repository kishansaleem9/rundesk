import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'

import '@rundesk/ui/styles.css'

import { routeTree } from './routeTree.gen'
import { queryClient } from './lib/query'
import { useAuthStore, type AuthUser } from './store/auth'
import { useThemeStore, type Theme } from './store/theme'
import { api } from './lib/api'
import { PwaInstallPrompt } from './components/pwa-install-prompt'
import { I18nProvider } from './lib/i18n'
import { useCustomDomainBootstrap } from './lib/custom-domain'
import { installChunkReloadHandlers } from './lib/chunk-reload'
import { useSidebarStore, setSidebarPersister } from './store/sidebar'
import { RoutePending } from './components/loading-skeletons'

const THEME_VALUES: Theme[] = ['system', 'light', 'dark']

// Chunk failures that never reach a React boundary — a hover-preload, or an
// import() awaited in an event handler. Installed before the router exists so
// nothing can slip through during startup.
installChunkReloadHandlers()

/*
 * §1.3 — send the collapse to the member's row when they change it.
 *
 * Registered here rather than inside the store so the store keeps no dependency
 * on the api client. Failure is swallowed on purpose: a preference that did not
 * reach the server is a preference that will not follow you to another browser,
 * which is a smaller problem than a sidebar that refuses to collapse.
 */
setSidebarPersister((collapsed) => {
  if (!useAuthStore.getState().isAuthenticated()) return
  void api('/users/me', { method: 'PATCH', body: { sidebarCollapsed: collapsed } }).catch(
    () => undefined,
  )
})

const router = createRouter({
  routeTree,
  // The actual auth state is re-injected on every render via <RouterProvider context={…}>.
  // We seed with the current snapshot so the initial type is AuthState (not any/unknown).
  context: {
    auth: useAuthStore.getState(),
    queryClient,
  },
  defaultPreload: 'intent',
  // Every route is a dynamic import, and without this they load into nothing —
  // the blank wait called out at 00:08 in the 7 Aug review. One wiring point
  // covers all 47 of them.
  defaultPendingComponent: RoutePending,
  // Show it quickly (the default 1s is long enough to read as a hang) but hold
  // it long enough not to strobe when a chunk is already cached.
  defaultPendingMs: 150,
  defaultPendingMinMs: 300,
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
    void api<(AuthUser & { theme?: string }) | null>('/users/me')
      .then((me) => {
        if (cancelled || !me) return
        useAuthStore.getState().setUser({
          id: me.id,
          email: me.email,
          displayName: me.displayName,
          role: me.role,
          avatarUrl: me.avatarUrl ?? null,
          // §1.5 / §6 — these are copied explicitly like the rest, and the
          // comment is here because leaving one out fails quietly: the top bar
          // simply resets to defaults on every load, with nothing to say why.
          // §6 shipped with topbarPinned missing from this list, and the
          // symptom was a tool you could pin, that wrote to the server
          // correctly, and never appeared.
          topbarHidden: me.topbarHidden ?? null,
          topbarPinned: me.topbarPinned ?? null,
        })
        // §1.3 — the server's collapse wins on load, so the choice travels
        // between browsers. null means never chosen: leave the local value
        // (and therefore the boot skeleton's guess) alone.
        if (typeof me.sidebarCollapsed === 'boolean') {
          useSidebarStore.getState().hydrateCollapsed(me.sidebarCollapsed)
        }
        // Cross-device theme (Plan §13.1): the server preference wins on load.
        if (me.theme && THEME_VALUES.includes(me.theme as Theme)) {
          useThemeStore.getState().hydrateTheme(me.theme as Theme)
        }
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
  // Custom-domain branding lookup (Plan §13.5). Non-blocking: applies branding
  // and surfaces the workspace mark when the host is a verified custom domain.
  useCustomDomainBootstrap()
  return (
    <>
      <RouterProvider router={router} context={{ auth, queryClient }} />
      <PwaInstallPrompt />
    </>
  )
}

/**
 * Take down the boot skeleton painted by index.html — but not until there is
 * something behind it.
 *
 * Calling `render()` is not the same as having rendered. On a deep link (a
 * shared URL, a bookmark, a refresh on any page) RouterProvider renders
 * *nothing at all* until the first match resolves, and every route here is a
 * lazy chunk. Measured: loading /app/:ws/docs with that chunk held for four
 * seconds left `<body>` completely empty for the duration — no sidebar, no top
 * bar. Removing the skeleton on the first frame put the blank screen straight
 * back, one layer down.
 *
 * So we wait for real pixels: poll for an element in #root big enough to be
 * something a person sees. The cap means a genuinely broken boot ends up
 * showing whatever the app did render (the error boundary, usually) rather
 * than shimmering forever.
 */
function dismissBootSkeleton() {
  const boot = document.getElementById('boot')
  const root = document.getElementById('root')
  if (!boot || !root) return

  const startedAt = Date.now()
  const hasPainted = () =>
    Array.from(root.querySelectorAll('*')).some((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 40 && rect.height > 24
    })

  const tick = () => {
    if (!hasPainted() && Date.now() - startedAt < 15_000) {
      requestAnimationFrame(tick)
      return
    }
    boot.style.transition = 'opacity 120ms ease-out'
    boot.style.opacity = '0'
    setTimeout(() => boot.remove(), 140)
  }
  requestAnimationFrame(tick)
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

dismissBootSkeleton()

