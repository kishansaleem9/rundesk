import { test, expect } from '@playwright/test'
import { uiLogin } from './helpers'

test('profile: edit display name and save (round-trip)', async ({ page }) => {
  await uiLogin(page)
  await page.goto('/app/profile')
  const input = page.locator('#displayName')
  await expect(input).toBeVisible()
  const original = await input.inputValue()
  await input.fill(`${original} ✎`)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  // restore the original name
  await input.fill(original)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
})
