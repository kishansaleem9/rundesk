import { createFileRoute, Link, Outlet, redirect, useMatches, useNavigate } from '@tanstack/react-router'
import { Badge, Button } from '@rundesk/ui'
import { ShieldCheck, ScrollText, Users, Settings, Webhook, Megaphone, Crown, LogOut, Plug, Globe } from 'lucide-react'
import { MasterAdminPanel } from '../components/master-admin-panel'
import { useAuthStore } from '../store/auth'
import { api, ApiError } from '../lib/api'

export const Route = createFileRoute('/app/admin')({
  // The super-admin console is platform-level — only super_admins may enter.
  beforeLoad: () => {
    if (useAuthStore.getState().user?.role !== 'super_admin') {
      throw redirect({ to: '/app' })
    }
  },
  component: AdminShell,
})

type NavItem = {
  label: string
  icon: typeof ShieldCheck
  to?: string
  disabled?: boolean
  description?: string
}

const navItems: NavItem[] = [
  { label: 'Master panel', icon: Crown, to: '/app/admin', description: 'Tenant control center' },
  { label: 'Features', icon: ShieldCheck, to: '/app/admin/features', description: 'Toggle every feature' },
  { label: 'Announcements', icon: Megaphone, to: '/app/admin/announcements', description: 'Workspace banners' },
  { label: 'Audit log', icon: ScrollText, to: '/app/admin/audit', description: 'See who changed what' },
  { label: 'Directory', icon: Globe, to: '/app/admin/directory', description: 'Global user directory — all users' },
  { label: 'Users', icon: Users, to: '/app/admin/users', description: 'Manage workspace members' },
  { label: 'Webhooks', icon: Webhook, to: '/app/admin/webhooks', description: 'Manage outbound webhooks' },
  { label: 'Integrations', icon: Plug, to: '/app/admin/integrations', description: 'Review provider access requests' },
  { label: 'Settings', icon: Settings, to: '/app/admin/settings', description: 'Workspace-level controls' },
]

function AdminShell() {
  const matches = useMatches()
  const isIndex = matches[matches.length - 1]?.routeId === '/app/admin'
  const navigate = useNavigate()
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const clear = useAuthStore((s) => s.clear)

  async function handleSignOut() {
    try {
      if (refreshToken) {
        await api('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        })
      }
    } catch (err) {
      if (!(err instanceof ApiError)) console.error(err)
    } finally {
      clear()
      navigate({ to: '/login' })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <aside className="md:w-64 md:shrink-0 border-b md:border-b-0 md:border-r border-border/60 bg-card/30 backdrop-blur-md px-3 py-3 md:py-4 flex flex-col">
        <div className="px-3 pb-4 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-gradient text-white shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Super admin
            </p>
            <p className="text-[11px] text-muted-foreground/70">Platform-wide controls</p>
          </div>
        </div>
        <nav className="flex gap-0.5 overflow-x-auto md:overflow-visible md:flex-col">
          {navItems.map((item) => {
            const Icon = item.icon
            if (item.disabled || !item.to) {
              return (
                <span
                  key={item.label}
                  aria-disabled="true"
                  className="group flex items-center gap-2.5 cursor-not-allowed rounded-md px-3 py-2 text-sm text-muted-foreground/40 whitespace-nowrap"
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  <Badge variant="soft" className="text-[9px] uppercase">soon</Badge>
                </span>
              )
            }
            return (
              <Link
                key={item.label}
                to={item.to}
                className="group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-card/60 hover:text-foreground transition-colors whitespace-nowrap"
                activeProps={{
                  className:
                    'group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm bg-accent/15 text-foreground font-medium',
                }}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="md:mt-auto px-2 pt-3 md:pt-4">
          <Button variant="outline" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <div className="flex-1 min-w-0 overflow-auto">
        {isIndex ? <MasterAdminPanel /> : <Outlet />}
      </div>
    </div>
  )
}
