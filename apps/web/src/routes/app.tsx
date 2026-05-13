import { createFileRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { Suspense, lazy, useState } from 'react'
import { WorkspaceSidebar } from '../components/workspace-sidebar'
import { AppTopbar } from '../components/app-topbar'
import { ShortcutsOverlay } from '../components/shortcuts-overlay'

const CommandPalette = lazy(async () => {
  const mod = await import('../components/command-palette')
  return { default: mod.CommandPalette }
})

export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated()) {
      throw redirect({ to: '/login' })
    }
  },
  component: AppShell,
})

function AppShell() {
  const [cmdOpen, setCmdOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // The /app/admin subtree renders its own chrome, so skip the workspace
  // sidebar / topbar / command palette to avoid double-stacking shells.
  const isAdminRoute = pathname.startsWith('/app/admin')

  if (isAdminRoute) {
    return (
      <div className="h-screen flex bg-background overflow-hidden">
        <div className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <WorkspaceSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AppTopbar onCommandOpen={() => setCmdOpen(true)} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      {cmdOpen ? (
        <Suspense fallback={null}>
          <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
        </Suspense>
      ) : null}
      <ShortcutsOverlay />
    </div>
  )
}
