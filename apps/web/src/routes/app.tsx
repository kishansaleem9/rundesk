import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { WorkspaceSidebar } from '../components/workspace-sidebar'
import { AppTopbar } from '../components/app-topbar'
import { CommandPalette } from '../components/command-palette'

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

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <WorkspaceSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AppTopbar onCommandOpen={() => setCmdOpen(true)} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  )
}
