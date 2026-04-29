import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { Badge } from '@rundesk/ui'
import { ShieldCheck, ScrollText, Users, Settings, Webhook, Megaphone } from 'lucide-react'

export const Route = createFileRoute('/app/admin')({
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
  { label: 'Features', icon: ShieldCheck, to: '/app/admin/features', description: 'Toggle every feature' },
  { label: 'Announcements', icon: Megaphone, to: '/app/admin/announcements', description: 'Workspace banners' },
  { label: 'Audit log', icon: ScrollText, to: '/app/admin/audit', description: 'See who changed what' },
  { label: 'Users', icon: Users, disabled: true, description: 'Coming soon' },
  { label: 'Webhooks', icon: Webhook, disabled: true, description: 'Coming soon' },
  { label: 'Settings', icon: Settings, disabled: true, description: 'Coming soon' },
]

function AdminShell() {
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-64 shrink-0 border-r border-border/60 bg-card/30 backdrop-blur-md px-3 py-4">
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
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon
            if (item.disabled || !item.to) {
              return (
                <span
                  key={item.label}
                  aria-disabled="true"
                  className="group flex items-center gap-2.5 cursor-not-allowed rounded-md px-3 py-2 text-sm text-muted-foreground/40"
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
                className="group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-card/60 hover:text-foreground transition-colors"
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
      </aside>
      <div className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}
