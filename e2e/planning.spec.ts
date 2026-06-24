import { test, expect } from '@playwright/test'
import { apiLogin, apiGet, apiDelete, uiLogin, uniq } from './helpers'

test.describe('planning modules', () => {
  let token = ''
  let wsId = ''
  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    wsId = a.workspaces[0].id
  })

  test('create a sprint and open its detail page', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/sprints`)
    await page.getByRole('button', { name: 'New sprint' }).click()
    const name = uniq('sprint')
    await page.getByPlaceholder('Sprint name (e.g. Sprint 12)').fill(name)
    // start + end dates are required (the Create button stays disabled otherwise)
    const dates = page.locator('input[type="date"]')
    await dates.nth(0).fill('2026-08-01')
    await dates.nth(1).fill('2026-08-15')
    await page.getByRole('button', { name: 'Create sprint' }).click()
    await expect(page.getByText(name).first()).toBeVisible()

    const sprints = await apiGet(request, token, `/workspaces/${wsId}/sprints`)
    const s = Array.isArray(sprints) ? sprints.find((x: any) => x.name === name) : null
    expect(s, 'sprint created').toBeTruthy()

    // the detail route must render the detail page, NOT be shadowed by the list
    await page.goto(`/app/${wsId}/sprints/${s.id}`)
    await expect(page.getByText(name).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'New sprint' })).toHaveCount(0)

    await apiDelete(request, token, `/sprints/${s.id}`)
  })

  test('create a goal and open its detail page', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/goals`)
    await page.getByRole('button', { name: 'New goal' }).click()
    const title = uniq('goal')
    await page.getByPlaceholder('Goal title (e.g. Ship v1.0 by end of Q2)').fill(title)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByText(title).first()).toBeVisible()

    const goals = await apiGet(request, token, `/workspaces/${wsId}/goals`)
    const g = Array.isArray(goals) ? goals.find((x: any) => x.title === title) : null
    expect(g, 'goal created').toBeTruthy()

    await page.goto(`/app/${wsId}/goals/${g.id}`)
    await expect(page.getByText(title).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'New goal' })).toHaveCount(0)

    await apiDelete(request, token, `/goals/${g.id}`)
  })
})
