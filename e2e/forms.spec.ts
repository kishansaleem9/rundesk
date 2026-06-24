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

    // confirm the form was created, then open its builder
    let formId = ''
    await expect
      .poll(
        async () => {
          const forms = await apiGet(request, token, `/workspaces/${wsId}/forms`)
          const f = Array.isArray(forms) ? forms.find((x: any) => x.title === name) : null
          if (f) formId = f.id
          return !!f
        },
        { timeout: 10_000 },
      )
      .toBe(true)

    await page.goto(`/app/${wsId}/forms/${formId}`)
    await expect(page.getByRole('heading', { name })).toBeVisible() // builder shows the form title
    await page.getByRole('button', { name: 'Add field', exact: true }).first().click()
    await expect(page.getByPlaceholder('Field label')).toBeVisible()

    await apiDelete(request, token, `/workspaces/${wsId}/forms/${formId}`)
  })
})
