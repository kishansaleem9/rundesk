import { test, expect } from '@playwright/test'
import { apiLogin, apiGet, apiDelete, uiLogin, uniq } from './helpers'

test.describe('settings: webhooks', () => {
  let token = ''
  let wsId = ''
  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    wsId = a.workspaces[0].id
  })

  test('create and delete a webhook', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/settings`)
    await page.getByRole('button', { name: 'Integrations', exact: true }).click()
    await page.getByRole('button', { name: 'Add webhook' }).click()
    const name = uniq('webhook').slice(0, 28)
    await page.getByPlaceholder('Name (e.g. Slack notifications)').fill(name)
    await page.getByPlaceholder('https://your-endpoint.com/hook').fill('https://example.com/hook')
    await page.getByRole('button', { name: 'task.created' }).first().click() // pick an event
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    let id = ''
    await expect
      .poll(async () => {
        const hooks = await apiGet(request, token, `/workspaces/${wsId}/webhooks`)
        const w = Array.isArray(hooks) ? hooks.find((x: any) => x.name === name) : null
        if (w) id = w.id
        return !!w
      }, { timeout: 10_000 })
      .toBe(true)
    if (id) await apiDelete(request, token, `/workspaces/${wsId}/webhooks/${id}`)
  })
})
