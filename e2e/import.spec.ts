import { test, expect } from '@playwright/test'
import { apiLogin, uiLogin } from './helpers'

// ClickUp import — upload a CSV and preview (non-destructive: preview only,
// no actual import).
test('import: upload a CSV and see the preview', async ({ page, request }) => {
  const wsId = (await apiLogin(request)).workspaces[0].id
  await uiLogin(page)
  await page.goto(`/app/${wsId}/import`)

  await page.locator('input[type="file"]').setInputFiles({
    name: 'clickup-export.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Task Name,Status,Priority\nDesign homepage,to do,high\nWrite copy,in progress,normal\nQA pass,complete,low'),
  })
  await page.getByRole('button', { name: /Preview/i }).click()
  await expect(page.getByText(/Total rows|Lists detected|Review preview/i).first()).toBeVisible({ timeout: 15_000 })
})
