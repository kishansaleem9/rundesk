import { test, expect } from '@playwright/test'
import { apiLogin, uiLogin } from './helpers'

test.describe('analytics & dashboards', () => {
  let wsId = ''
  test.beforeAll(async ({ request }) => {
    wsId = (await apiLogin(request)).workspaces[0].id
  })

  test('reports: switch tabs and the export control is present', async ({ page }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/reports`)
    for (const tab of ['Productivity', 'Completion', 'Time', 'Sprints', 'Goals']) {
      await page.getByRole('button', { name: tab, exact: true }).first().click()
      await expect(page.getByRole('button', { name: tab, exact: true }).first()).toBeVisible()
    }
    await page.getByRole('button', { name: 'Custom', exact: true }).first().click()
    await expect(page.getByRole('button', { name: 'Export CSV' }).first()).toBeVisible()
  })

  test('dashboard: toggle Overview / Custom dashboard', async ({ page }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/dashboard`)
    await page.getByRole('button', { name: 'Custom dashboard' }).click()
    await expect(page.getByRole('button', { name: /Edit dashboard|Add widget|Save/ }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Overview', exact: true }).click()
  })

  test('workload: change the time-range filter', async ({ page }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/workload`)
    await page.getByRole('button', { name: '30 days' }).click()
    await expect(page.getByRole('button', { name: '30 days' })).toBeVisible()
  })

  test('timeline: change the zoom level', async ({ page }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/timeline`)
    await page.getByRole('button', { name: 'week', exact: true }).click()
    await page.getByRole('button', { name: 'month', exact: true }).click()
    await expect(page.getByRole('button', { name: 'month', exact: true })).toBeVisible()
  })
})
