import { createFileRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { lazyChunk } from '../lib/chunk-reload'
import {
  CommandPaletteSkeleton,
  PanelSkeleton,
  RoutePending,
  useRouteLoading,
} from '../components/loading-skeletons'
import { WorkspaceSidebar } from '../components/workspace-sidebar'
import { AppTopbar } from '../components/app-topbar'
import { ShortcutsOverlay } from '../components/shortcuts-overlay'
import { SupportWidget } from '../components/support-widget'
import { NewBuildAvailable } from '../components/new-build-available'

const CommandPalette = lazy(
  lazyChunk(async () => {
    const mod = await import('../components/command-palette')
    return { default: mod.CommandPalette }
  }),
)

// §A6.4 — the assistant used to be reachable only from the AI page. It is
// docked here instead, and loaded on first open so it costs nothing until then.
const AiPanel = lazy(
  lazyChunk(async () => {
    const mod = await import('../components/ai-panel')
    return { default: mod.AiPanel }
  }),
)

export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated()) {
      throw redirect({ to: '/login' })
    }
  },
  component: AppShell,
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * §A6.4 — the docked panel forwards a free-text "where am I" hint that the
 * server folds into the workspace context (§7.15). The matched route is the
 * cheapest honest description: named segments are the surface ("docs",
 * "time approvals"), and an id-only tail is a depth in the space hierarchy.
 */
function describeCurrentView(routeId: string): string | undefined {
  const tail = routeId.replace('/app/$workspaceId', '').split('/').filter(Boolean)
  if (tail.length === 0) return 'home'
  const named = tail.filter((segment) => !segment.startsWith('$'))
  if (named.length > 0) return named.join(' / ')
  return ['space', 'project', 'list'][tail.length - 1]
}

function AppShell() {
  const [cmdOpen, setCmdOpen] = useState(false)
  const [cmdQuery, setCmdQuery] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [aiAsk, setAiAsk] = useState<{ text: string; id: number } | undefined>(undefined)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const routeId = useRouterState({ select: (s) => s.matches[s.matches.length - 1]?.routeId ?? '' })

  // Open the command palette, optionally seeding it with a query forwarded
  // from the header search input.
  const openCommand = (query?: string) => {
    setCmdQuery(query ?? '')
    setCmdOpen(true)
  }

  // §A6.4 — a question from the palette opens the dock and is asked straight
  // away; the id keeps two identical questions distinguishable.
  const askAi = (question: string) => {
    setAiAsk({ text: question, id: Date.now() })
    setAiOpen(true)
  }

  // ⌘K / Ctrl+K must live here: the palette itself is only mounted while
  // open, so a listener inside the component can never open it.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdQuery('')
        setCmdOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // The /app/admin subtree renders its own chrome, so skip the workspace
  // sidebar / topbar / command palette to avoid double-stacking shells.
  const isAdminRoute = pathname.startsWith('/app/admin')

  // The panel is grounded in a workspace, so it only docks on a workspace route.
  const workspaceId = useMemo(() => {
    const candidate = pathname.split('/').filter(Boolean)[1]
    return candidate && UUID_RE.test(candidate) ? candidate : null
  }, [pathname])
  const aiDocked = aiOpen && !!workspaceId && !isAdminRoute
  const routeLoading = useRouteLoading()

  if (isAdminRoute) {
    return (
      <div className="h-screen flex bg-background overflow-hidden">
        <div className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </div>
        {/* Both shells: a tab left on either one goes just as stale. */}
        <NewBuildAvailable />
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <WorkspaceSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AppTopbar
          onCommandOpen={openCommand}
          onAiToggle={workspaceId ? () => setAiOpen((v) => !v) : undefined}
          aiOpen={aiDocked}
        />
        <main className="flex-1 overflow-auto">
          {/* The shell is already on screen, so only the column waits. Without
              this the router leaves the *previous* page up for the whole fetch
              and a click looks like it did nothing. */}
          {routeLoading ? <RoutePending /> : <Outlet />}
        </main>
      </div>
      {aiDocked ? (
        // Narrow screens have no room for a column, so the dock overlays there
        // and becomes a real third column from md up.
        <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-border/60 shadow-xl md:static md:z-auto md:w-[380px] md:max-w-none md:shadow-none">
          <Suspense fallback={<PanelSkeleton className="h-full bg-card" />}>
            <AiPanel
              workspaceId={workspaceId!}
              currentView={describeCurrentView(routeId)}
              ask={aiAsk}
              onAskHandled={() => setAiAsk(undefined)}
              onClose={() => setAiOpen(false)}
              className="h-full"
            />
          </Suspense>
        </aside>
      ) : null}
      {cmdOpen ? (
        <Suspense fallback={<CommandPaletteSkeleton />}>
          <CommandPalette
            open={cmdOpen}
            onOpenChange={setCmdOpen}
            initialQuery={cmdQuery}
            onAskAi={workspaceId ? askAi : undefined}
          />
        </Suspense>
      ) : null}
      <ShortcutsOverlay />
      <SupportWidget />
      <NewBuildAvailable />
    </div>
  )
}
