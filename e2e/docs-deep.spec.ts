import { test, expect } from '@playwright/test'
import { apiLogin, apiPost, apiDelete, uiLogin, uniq } from './helpers'

test.describe('docs — comments, history, public share', () => {
  let token = ''
  let wsId = ''
  let docId = ''

  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    wsId = a.workspaces[0].id
    const doc = await apiPost(request, token, `/workspaces/${wsId}/docs`, { title: uniq('deep-doc') })
    docId = doc.id
  })
  test.afterAll(async ({ request }) => {
    if (docId) await apiDelete(request, token, `/docs/${docId}`)
  })

  test('add a comment to a doc', async ({ page }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/docs?doc=${docId}`)
    await page.getByRole('button', { name: 'Show comments' }).click()
    const body = uniq('doc-comment')
    await page.getByPlaceholder('Add a comment…').fill(body)
    await page.getByRole('button', { name: 'Post comment' }).click()
    await expect(page.getByText(body)).toBeVisible()
  })

  test('open version history', async ({ page }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/docs?doc=${docId}`)
    await page.getByRole('button', { name: 'Version history' }).click()
    await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible()
  })

  test('toggle public share on and off', async ({ page }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/docs?doc=${docId}`)
    await page.getByRole('button', { name: 'Share doc publicly' }).click()
    await expect(page.getByRole('button', { name: 'Disable public share' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Disable public share' }).click()
  })
})
