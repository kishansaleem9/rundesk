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

  test('create a sprint', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/sprints`)
    await page.getByRole('button', { name: 'New sprint' }).click()
    const name = uniq('sprint')
    await page.getByPlaceholder('Sprint name (e.g. Sprint 12)').fill(name)
    await page.getByRole('button', { name: 'Create sprint' }).click()
    await expect(page.getByText(name).first()).toBeVisible()
    // cleanup
    const sprints = await apiGet(request, token, `/workspaces/${wsId}/sprints`)
    const s = Array.isArray(sprints) ? sprints.find((x: any) => x.name === name) : null
    if (s) await apiDelete(request, token, `/sprints/${s.id}`)
  })

  test('create a goal', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/goals`)
    await page.getByRole('button', { name: 'New goal' }).click()
    const title = uniq('goal')
    await page.getByPlaceholder('Goal title (e.g. Ship v1.0 by end of Q2)').fill(title)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByText(title).first()).toBeVisible()
    // cleanup
    const goals = await apiGet(request, token, `/workspaces/${wsId}/goals`)
    const g = Array.isArray(goals) ? goals.find((x: any) => x.title === title) : null
    if (g) await apiDelete(request, token, `/goals/${g.id}`)
  })
})
