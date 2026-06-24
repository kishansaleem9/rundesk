import { test, expect } from '@playwright/test'
import { apiLogin, uiLogin } from './helpers'

// Smoke: every feature page must render its own heading (headings are <h1>/<h2>,
// which the sidebar nav is not — so this proves the *page* mounted, not just the
// nav link). Catches blank screens / crashed routes across the whole app.
const PAGES: Array<[path: string, heading: RegExp]> = [
  ['/dashboard', /Good (morning|afternoon|evening)/i],
  ['/docs', /Docs/],
  ['/sprints', /Sprints/],
  ['/goals', /Goals/],
  ['/reports', /Reports/],
  ['/insights', /Insights/],
  ['/workload', /Workload/],
  ['/timeline', /Timeline/],
  ['/forms', /Forms/],
  ['/templates', /Templates/],
  ['/automations', /Automations/],
  ['/clips', /Clips/],
  ['/mindmaps', /Mind maps/],
  ['/whiteboards', /Whiteboards/],
  ['/ai', /Rundesk AI/],
  ['/import', /Import from ClickUp/],
  ['/time', /Time tracking/],
  ['/time/approvals?tab=pending', /Approvals/],
  ['/inbox', /Notifications/],
  ['/integrations', /Integrations/],
  ['/settings', /Settings/],
]

test.describe('smoke — every page renders', () => {
  let wsId = ''
  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    wsId = a.workspaces[0].id
  })

  for (const [path, heading] of PAGES) {
    test(`renders ${path}`, async ({ page }) => {
      await uiLogin(page)
      await page.goto(`/app/${wsId}${path}`)
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 20_000 })
    })
  }

  test('renders /app/profile', async ({ page }) => {
    await uiLogin(page)
    await page.goto('/app/profile')
    await expect(page.getByRole('heading', { name: /Your profile/ }).first()).toBeVisible({ timeout: 20_000 })
  })

  test('renders the chat page', async ({ page }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/chat`)
    await expect(page.getByPlaceholder(/^Message /)).toBeVisible({ timeout: 20_000 })
  })
})
