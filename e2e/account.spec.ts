import { test, expect } from '@playwright/test'
import { apiLogin, apiGet, apiDelete, uiLogin, uniq } from './helpers'

test.describe('time / roles / api keys', () => {
  let token = ''
  let wsId = ''
  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    wsId = a.workspaces[0].id
  })

  test('time tracking: switch tabs', async ({ page }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/time`)
    for (const tab of ['timer', 'reports', 'timesheet']) {
      await page.getByRole('button', { name: tab, exact: true }).first().click()
      await expect(page.getByRole('button', { name: tab, exact: true }).first()).toBeVisible()
    }
  })

  test('settings: create and revoke an API key', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/settings`)
    await page.getByRole('button', { name: 'Security', exact: true }).click()
    const name = uniq('apikey').slice(0, 24)
    await page.getByPlaceholder('Key name').fill(name)
    await page.getByRole('button', { name: 'Generate' }).click()
    let id = ''
    await expect
      .poll(async () => {
        const keys = await apiGet(request, token, `/workspaces/${wsId}/api-keys`)
        const k = Array.isArray(keys) ? keys.find((x: any) => x.name === name) : null
        if (k) id = k.id
        return !!k
      }, { timeout: 10_000 })
      .toBe(true)
    if (id) await apiDelete(request, token, `/workspaces/${wsId}/api-keys/${id}`)
  })

  test('settings: create a custom role', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/settings`)
    await page.getByRole('button', { name: 'Roles', exact: true }).click()
    await page.getByRole('button', { name: 'New role' }).click()
    const roleName = uniq('role').slice(0, 24)
    await page.getByPlaceholder('e.g. Project Lead').fill(roleName)
    await page.getByRole('button', { name: 'Create role' }).click()
    let id = ''
    await expect
      .poll(async () => {
        const roles = await apiGet(request, token, `/workspaces/${wsId}/roles`)
        const r = Array.isArray(roles) ? roles.find((x: any) => x.name === roleName) : null
        if (r) id = r.id
        return !!r
      }, { timeout: 10_000 })
      .toBe(true)
    if (id) await apiDelete(request, token, `/workspaces/${wsId}/roles/${id}`)
  })
})
