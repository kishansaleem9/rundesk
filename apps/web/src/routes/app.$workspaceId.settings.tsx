import { createFileRoute, redirect } from '@tanstack/react-router'
import { getWorkspaceRole } from '../hooks/use-workspace-role'
import { permissionsQuery } from '../hooks/use-permissions'
import { SETTINGS_TABS, landingTab, settingsTabsFor, type SettingsTabId } from '../hooks/use-settings-access'
import type { ImportsExportsSearch } from '../components/imports/imports-exports-tab'
import { CSV_SOURCE_KEYS, isCsvSource } from '@rundesk/imports'

const LOCATION_TYPES = ['space', 'folder', 'project', 'list'] as const

/**
 * Settings › Imports / Exports reads the spec's own parameters (§1.1):
 * `?import=false` (the Export tab), `?spreadsheet=true` (that importer), `?asana=true`
 * and the other apps whose export it reads,
 * `?importId=` (a report), `&via=` (analytics), and a destination handed in
 * from a Space's menu. Only present ones are kept, so other tabs' addresses
 * stay as they were.
 */
function importsExportsSearch(search: Record<string, unknown>): ImportsExportsSearch {
  const flag = (v: unknown) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined)
  const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)
  const out: ImportsExportsSearch = {}
  if (flag(search.import) !== undefined) out.import = flag(search.import)
  if (flag(search.spreadsheet)) out.spreadsheet = true
  // An app's export: `?source=asana`, or the spec's own `?asana=true` (§1.1).
  const app = isCsvSource(search.source) ? search.source : CSV_SOURCE_KEYS.find((key) => flag(search[key]))
  if (app) {
    out.spreadsheet = true
    out.source = app
  }
  if (uuid(search.importId)) out.importId = uuid(search.importId)
  if (typeof search.via === 'string') out.via = search.via.slice(0, 40)
  if ((LOCATION_TYPES as readonly string[]).includes(search.locationType as string) && uuid(search.locationId)) {
    out.locationType = search.locationType as ImportsExportsSearch['locationType']
    out.locationId = uuid(search.locationId)
  }
  return out
}

export const Route = createFileRoute('/app/$workspaceId/settings')({
  // §A4.5 — the workspace panel links straight at People, so the tab has to
  // survive the navigation.
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTabId } & ImportsExportsSearch => ({
    tab: (SETTINGS_TABS as readonly string[]).includes(search.tab as string)
      ? (search.tab as SettingsTabId)
      : undefined,
    ...importsExportsSearch(search),
  }),
  beforeLoad: ({ params, search, context }) => {
    const workspaceId = (params as any)?.workspaceId as string | undefined
    const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      workspaceId ?? '',
    )
    if (!ok) {
      throw redirect({ to: '/app/profile' })
    }
    // Workspace settings (branding, members, integrations, security) are an
    // admin's — and a tab is also the holder's of a key it serves, which a
    // custom role can grant (`useSettingsAccess`): webhooks, integrations, SSO.
    // The API already honoured those grants; this route sent their holders back
    // to the start (`product-siblings/custom-role-permissions-unread-by-web`).
    const { isAdmin, role } = getWorkspaceRole(workspaceId)
    if (isAdmin) return
    /*
     * DECIDED FROM AN ANSWER ALREADY HELD, NEVER AWAITED HERE. This awaited the
     * permission read and then threw its redirect: with the read slow (a
     * sweep's load, a slow network), the load was superseded while it waited,
     * the late redirect escaped the router as an uncaught throw, and the whole
     * page went blank — every time, with the read held back 4.5 s
     * (found-28-sep/settings-blank-on-a-slow-permission-read). So the route
     * asks for the answer without waiting and decides only from a cached one;
     * the page makes the same decision when the answer lands.
     */
    const held = context.queryClient.getQueryData<{ permissions: string[] }>(permissionsQuery(workspaceId).queryKey)
    if (!held) {
      void context.queryClient.prefetchQuery(permissionsQuery(workspaceId)).catch(() => undefined)
      return
    }
    const tabs = settingsTabsFor(false, new Set(held.permissions ?? []), role)
    if (tabs.length === 0) {
      throw redirect({ to: '/app' })
    }
    // Arriving on a tab that is not theirs (or on none, which is General), they
    // are taken to the one they land on (`landingTab`), not shown an admin's
    // form to be refused.
    if (!search.tab || !tabs.includes(search.tab)) {
      throw redirect({ to: '/app/$workspaceId/settings', params: { workspaceId: workspaceId! }, search: { tab: landingTab(tabs) } })
    }
  },
})
