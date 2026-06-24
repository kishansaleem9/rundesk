import { test, expect } from '@playwright/test'
import { apiLogin, apiGet, apiDelete, uiLogin, uniq } from './helpers'

// Automations, whiteboards, mind maps — create flows.
test.describe('modules: automations / boards', () => {
  let token = ''
  let wsId = ''
  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    wsId = a.workspaces[0].id
  })

  test('create an automation rule', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/automations`)
    await page.getByRole('button', { name: /New automation/i }).click()
    const name = uniq('automation')
    await page.getByPlaceholder('My automation').fill(name)
    await page.getByRole('button', { name: /Create automation/i }).click()
    // verify it persisted
    let id = ''
    await expect
      .poll(async () => {
        const list = await apiGet(request, token, `/workspaces/${wsId}/automations`)
        const a = Array.isArray(list) ? list.find((x: any) => x.name === name) : null
        if (a) id = a.id
        return !!a
      }, { timeout: 10_000 })
      .toBe(true)
    if (id) await apiDelete(request, token, `/workspaces/${wsId}/automations/${id}`)
  })

  test('create a whiteboard', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/whiteboards`)
    await page.getByRole('button', { name: /New board/i }).click()
    // the editor toolbar appears (Note / Text add buttons)
    await expect(page.getByRole('button', { name: /^Note$/ }).or(page.getByRole('button', { name: /Add note/i }))).toBeVisible({ timeout: 15_000 })
    // cleanup any canvases this created
    const canvases = await apiGet(request, token, `/workspaces/${wsId}/canvases`)
    if (Array.isArray(canvases)) {
      for (const c of canvases.filter((x: any) => x.type === 'whiteboard')) {
        await apiDelete(request, token, `/workspaces/${wsId}/canvases/${c.id}`)
      }
    }
  })

  test('create a mind map', async ({ page, request }) => {
    await uiLogin(page)
    await page.goto(`/app/${wsId}/mindmaps`)
    await page.getByRole('button', { name: /New mind map/i }).click()
    await expect(page.getByPlaceholder('Node label').or(page.getByRole('button', { name: /Add child/i }))).toBeVisible({ timeout: 15_000 })
    const canvases = await apiGet(request, token, `/workspaces/${wsId}/canvases`)
    if (Array.isArray(canvases)) {
      for (const c of canvases.filter((x: any) => x.type === 'mindmap')) {
        await apiDelete(request, token, `/workspaces/${wsId}/canvases/${c.id}`)
      }
    }
  })
})
