import { test, expect } from '@playwright/test'
import { apiLogin, apiGet, apiDelete, uiLogin, uniq } from './helpers'

// Workspace settings (admin-only; the QA account is a workspace admin).
test.describe('workspace settings', () => {
  let token = ''
  let wsId = ''
  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    wsId = a.workspaces[0].id
  })

  test('settings tabs switch and render their content', async ({ page }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/settings`)
    await expect(page.getByRole('heading', { name: /Settings/ }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Members', exact: true }).click()
    await expect(page.getByPlaceholder('teammate@company.com')).toBeVisible()

    await page.getByRole('button', { name: 'Groups', exact: true }).click()
    await expect(page.getByPlaceholder('Search groups…')).toBeVisible()

    await page.getByRole('button', { name: 'Integrations', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Add webhook' })).toBeVisible()

    await page.getByRole('button', { name: 'Security', exact: true }).click()
    await expect(page.getByText('API keys').first()).toBeVisible()
  })

  test('create and remove a label', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/settings`)
    await page.getByRole('button', { name: 'Labels', exact: true }).click()
    const name = uniq('label').slice(0, 20)
    await page.getByPlaceholder('Label name').fill(name)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText(name).first()).toBeVisible()
    // cleanup
    const labels = await apiGet(request, token, `/workspaces/${wsId}/labels`)
    const l = Array.isArray(labels) ? labels.find((x: any) => x.name === name) : null
    if (l) await apiDelete(request, token, `/labels/${l.id}`)
  })
})
