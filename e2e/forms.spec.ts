import { test, expect } from '@playwright/test'
import { apiLogin, apiGet, apiDelete, uiLogin, uniq } from './helpers'

test.describe('forms', () => {
  let token = ''
  let wsId = ''
  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    wsId = a.workspaces[0].id
  })

  test('create a form and add a field', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/forms`)
    await page.getByRole('button', { name: /New form|Create your first form/ }).first().click()
    const name = uniq('form')
    await page.getByPlaceholder('e.g. Bug report, Feature request…').fill(name)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    // lands in the builder
    await expect(page.getByText('builder')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Add field/ }).first().click()
    await expect(page.getByPlaceholder('Field label')).toBeVisible()

    // cleanup
    const forms = await apiGet(request, token, `/workspaces/${wsId}/forms`)
    const f = Array.isArray(forms) ? forms.find((x: any) => x.title === name) : null
    if (f) await apiDelete(request, token, `/workspaces/${wsId}/forms/${f.id}`)
  })
})
