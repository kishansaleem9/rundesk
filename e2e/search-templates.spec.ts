import { test, expect } from '@playwright/test'
import { apiLogin, apiGet, apiDelete, apiPost, uiLogin, uniq } from './helpers'

test.describe('search & templates', () => {
  let token = ''
  let wsId = ''
  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    wsId = a.workspaces[0].id
  })

  test('global search returns results for a query', async ({ page }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}`)
    await page.getByPlaceholder('Search or jump to…').click()
    await page.keyboard.type('a')
    // the command palette should surface at least one result/option row
    await expect(page.getByRole('option').or(page.getByRole('listitem')).first()).toBeVisible({ timeout: 10_000 })
  })

  test('apply a project template into a space', async ({ page, request }) => {
    // a target space to apply into
    const space = await apiPost(request, token, '/spaces', { workspaceId: wsId, name: uniq('tmpl-space') })
    try {
      await uiLogin(page)
      await page.goto(`/app/${wsId}/templates`)
      await page.getByRole('button', { name: /Use template/i }).first().click()
      const projectName = uniq('tmpl-project')
      await page.getByPlaceholder('Name for the new project').fill(projectName)
      // pick the target space in the dialog's select
      await page.getByRole('combobox').last().selectOption({ label: space.name }).catch(async () => {
        await page.getByRole('combobox').last().selectOption({ index: 1 })
      })
      await page.getByRole('button', { name: /Apply template/i }).click()
      // a new project should appear under the space
      let projectId = ''
      await expect
        .poll(async () => {
          const projects = await apiGet(request, token, `/projects/space/${space.id}`)
          const p = Array.isArray(projects) ? projects[0] : null
          if (p) projectId = p.id
          return Array.isArray(projects) ? projects.length : 0
        }, { timeout: 15_000 })
        .toBeGreaterThan(0)
    } finally {
      await apiDelete(request, token, `/spaces/${space.id}`)
    }
  })
})
