import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { WorkspaceSidebar } from '../components/workspace-sidebar'
import { AppTopbar } from '../components/app-topbar'
import { CommandPalette } from '../components/command-palette'
import { WorkspaceAnnouncementBanner } from '../components/announcement-banner'

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
  const isSuperAdmin = pathname.startsWith('/app/admin')

  if (isSuperAdmin) {
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
      <div className="flex-1 flex flex-col min-w-0">
        <WorkspaceAnnouncementBanner />
        <AppTopbar onCommandOpen={() => setCmdOpen(true)} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <WorkspaceSidebar />
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  )
}
