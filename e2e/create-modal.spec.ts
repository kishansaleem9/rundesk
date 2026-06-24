import { test, expect } from '@playwright/test'
import { apiLogin, apiGet, apiDelete, uiLogin, uniq } from './helpers'

// The global "New" create modal (top bar) — Task / Project / Space / Doc tabs.
test.describe('create modal', () => {
  let token = ''
  let wsId = ''
  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    wsId = a.workspaces[0].id
  })

  test('create a Space via the New modal', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}`)
    await page.getByRole('button', { name: 'New' }).click()
    await page.getByRole('button', { name: 'Space', exact: true }).click()
    const name = uniq('space')
    await page.getByPlaceholder('Space name…').fill(name)
    await page.getByRole('button', { name: 'Create space' }).click()
    await page.waitForURL(new RegExp(`/app/${wsId}/[0-9a-f-]{36}`), { timeout: 15_000 })
    const spaceId = page.url().split('?')[0].split('/').pop()!
    await apiDelete(request, token, `/spaces/${spaceId}`)
  })

  test('create a Doc via the New modal', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}`)
    await page.getByRole('button', { name: 'New' }).click()
    await page.getByRole('button', { name: 'Doc', exact: true }).click()
    const name = uniq('doc')
    await page.getByPlaceholder('Doc title (optional)…').fill(name)
    await page.getByRole('button', { name: 'Create doc' }).click()
    await page.waitForURL(/\/docs/, { timeout: 15_000 })
    await expect(page.getByText(name).first()).toBeVisible()
    const docs = await apiGet(request, token, `/workspaces/${wsId}/docs`)
    const d = Array.isArray(docs) ? docs.find((x: any) => x.title === name) : null
    if (d) await apiDelete(request, token, `/docs/${d.id}`)
  })
})
