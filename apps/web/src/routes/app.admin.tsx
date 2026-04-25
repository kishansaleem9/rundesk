import { createFileRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/app/admin')({
  component: AdminShell,
})

type NavItem = {
  label: string
  to?: string
  disabled?: boolean
}

const navItems: NavItem[] = [
  { label: 'Features', to: '/app/admin/features' },
  { label: 'Audit log', disabled: true },
  { label: 'Users', disabled: true },
]

function AdminShell() {
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-56 shrink-0 border-r border-border bg-surface-50 px-2 py-4">
        <div className="px-3 pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Super admin
          </p>
        </div>
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) =>
            item.disabled || !item.to ? (
              <span
                key={item.label}
                aria-disabled="true"
                className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-muted-foreground/60"
              >
                {item.label}
              </span>
            ) : (
              <Link
                key={item.label}
                to={item.to}
                className="rounded-md px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{
                  className:
                    'rounded-md px-3 py-2 text-sm font-medium bg-brand-100 text-brand-900',
                }}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
      </aside>
      <div className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}
