import { test, expect } from '@playwright/test'
import { apiLogin, uiLogin, MEMBER_EMAIL, MEMBER_PASSWORD } from './helpers'

// Admin-vs-member gating (Testing doc T7/T14). Needs a member login:
//   E2E_MEMBER_EMAIL=member1@yopmail.com E2E_MEMBER_PASSWORD=Test@123456
test.describe('member permissions', () => {
  test.skip(!MEMBER_EMAIL || !MEMBER_PASSWORD, 'set E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD to run')

  test('a member cannot see or reach workspace Settings', async ({ page, request }) => {
    const { workspaces } = await apiLogin(request, MEMBER_EMAIL, MEMBER_PASSWORD)
    expect(workspaces.length).toBeGreaterThan(0)
    const wsId = workspaces[0].id
    await uiLogin(page, MEMBER_EMAIL, MEMBER_PASSWORD)
    await page.goto(`/app/${wsId}`)

    // Settings nav entry is hidden for non-admins
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0)

    // Direct navigation to settings redirects away
    await page.goto(`/app/${wsId}/settings`)
    await expect(page).not.toHaveURL(/\/settings/)
  })
})
