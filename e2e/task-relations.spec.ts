import { test, expect, Page } from '@playwright/test'
import { apiLogin, apiPost, apiGet, apiDelete, uiLogin, createTree, deleteTree, boardUrl, uniq, type Tree } from './helpers'

test.describe('task detail — watchers & custom fields', () => {
  let token = ''
  let tree: Tree
  let taskId = ''
  let taskTitle = ''

  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    tree = await createTree(request, token, a.workspaces[0].id)
    taskTitle = uniq('rel-task')
    taskId = (await apiPost(request, token, '/tasks', { listId: tree.listId, title: taskTitle })).id
  })
  test.afterAll(async ({ request }) => {
    await deleteTree(request, token, tree)
  })

  async function openTask(page: Page) {
    await uiLogin(page)
    await page.goto(boardUrl(tree))
    await page.getByText(taskTitle).first().click()
    await expect(page.getByText('Subtasks')).toBeVisible()
  }

  test('add a watcher', async ({ page }) => {
    await openTask(page)
    await page.getByText('Watchers').click()
    // scope to the watcher <select> (the one with the placeholder option)
    const sel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Add teammate as watcher' }) })
    await expect.poll(async () => sel.locator('option').count(), { timeout: 10_000 }).toBeGreaterThan(1)
    await sel.selectOption({ index: 1 })
    const addBtn = page.getByRole('button', { name: 'Add', exact: true })
    await expect(addBtn).toBeEnabled()
    await addBtn.click()
    await expect(page.getByText(/[1-9]\d* watcher/)).toBeVisible()
  })

  test('set a custom field value', async ({ page, request }) => {
    const def = await apiPost(request, token, `/workspaces/${tree.wsId}/projects/${tree.projectId}/custom-fields`, {
      name: 'E2E Severity',
      type: 'text',
    })
    await openTask(page)
    await page.getByText('Fields', { exact: true }).click()
    await expect(page.getByText('E2E Severity')).toBeVisible()
    // scope to the field's row so we don't grab the top-bar search box
    const input = page
      .locator('div')
      .filter({ hasText: 'E2E Severity' })
      .filter({ has: page.getByRole('textbox') })
      .last()
      .getByRole('textbox')
    await input.fill('critical')
    await input.blur() // text custom fields commit on blur
    await expect
      .poll(async () => {
        const rows = await apiGet(request, token, `/workspaces/${tree.wsId}/tasks/${taskId}/custom-fields`)
        const r = Array.isArray(rows) ? rows.find((x: any) => x.definition?.id === def.id) : null
        return r?.value ?? ''
      }, { timeout: 10_000 })
      .toBe('critical')
    await apiDelete(request, token, `/workspaces/${tree.wsId}/custom-fields/${def.id}`)
  })
})
