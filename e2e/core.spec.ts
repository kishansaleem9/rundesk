import { test, expect } from '@playwright/test'
import { apiLogin, uiLogin, EMAIL } from './helpers'

test.describe('auth', () => {
  test('login with valid credentials lands in the app', async ({ page }) => {
    await uiLogin(page)
    await expect(page).toHaveURL(/\/app(\/|$)/)
  })

  test('invalid password shows an error', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill('definitely-wrong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
  })

  test('inline validation flags an empty email on blur', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').click()
    await page.locator('#password').click() // blur the email field
    await expect(page.getByText('Email is required.')).toBeVisible()
  })
})

test.describe('shell', () => {
  test('top bar + search render after login', async ({ page, request }) => {
    const { workspaces } = await apiLogin(request)
    expect(workspaces.length, 'account has at least one workspace').toBeGreaterThan(0)
    await uiLogin(page)
    await page.goto(`/app/${workspaces[0].id}`)
    await expect(page.getByPlaceholder('Search or jump to…')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible()
  })

  test('global search opens the command palette and accepts input', async ({ page, request }) => {
    const { workspaces } = await apiLogin(request)
    await uiLogin(page)
    await page.goto(`/app/${workspaces[0].id}`)
    await page.getByPlaceholder('Search or jump to…').click()
    // cmdk renders a dialog/listbox once open
    const palette = page.getByRole('dialog')
    await expect(palette).toBeVisible()
    await page.keyboard.type('a')
    await expect(palette).toBeVisible()
  })
})
