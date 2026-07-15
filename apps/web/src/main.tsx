import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'

import '@rundesk/ui/styles.css'

import { routeTree } from './routeTree.gen'
import { queryClient } from './lib/query'
import { useAuthStore } from './store/auth'
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

function App() {
  const auth = useAuthStore()
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

