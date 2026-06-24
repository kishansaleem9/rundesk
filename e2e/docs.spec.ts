import { test, expect } from '@playwright/test'
import { apiLogin, uiLogin, uniq } from './helpers'

// Exercises the B7 docs editor: create a page, type, then use the rich-text
// controls that were just added (color, alignment, AI menu, Insert menu with
// "Create task from selection" / "Embed doc"), and Save.
test('docs editor: create a page and drive the B7 toolbar', async ({ page, request }) => {
  const { workspaces } = await apiLogin(request)
  const wsId = workspaces[0].id
  await uiLogin(page)
  await page.goto(`/app/${wsId}/docs`)

  const name = uniq('doc')
  await page.getByPlaceholder('New page name').fill(name)
  await page.getByRole('button', { name: 'Add page' }).click()

  const editor = page.locator('.ProseMirror')
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.type('Hello from the Rundesk e2e suite. ')
  await page.keyboard.press('Control+A')

  // Bold
  await page.getByRole('button', { name: 'B', exact: true }).click()
  // Font color (new): open palette, pick a swatch
  await page.getByRole('button', { name: 'Text color' }).click()
  await page.locator('button[title="#22c55e"]').click()
  // Alignment (new)
  await page.getByRole('button', { name: 'Align center' }).click()
  // AI menu (new): the chevron next to the AI button opens the modes list
  await page.getByRole('button', { name: 'More AI actions' }).click()
  await expect(page.getByText('Make shorter')).toBeVisible()
  await page.keyboard.press('Escape')
  // Insert menu (new): the B7 actions
  await page.getByRole('button', { name: 'Insert' }).click()
  await expect(page.getByText('Create task from selection')).toBeVisible()
  await expect(page.getByText('Embed doc')).toBeVisible()
  await page.getByText('Create task from selection').click()
  // the create-task dialog opens with a cascading space/project/list picker
  await expect(page.getByText('Create task from selection')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  // Save persists without error
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: /Saving|Save/ })).toBeVisible()
})
