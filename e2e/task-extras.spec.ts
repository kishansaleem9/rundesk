import { test, expect, Page } from '@playwright/test'
import { apiLogin, apiPost, apiGet, uiLogin, createTree, deleteTree, boardUrl, uniq, type Tree } from './helpers'

test.describe('task detail — assignee & attachment', () => {
  let token = ''
  let tree: Tree
  let taskId = ''
  let taskTitle = ''

  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    tree = await createTree(request, token, a.workspaces[0].id)
    taskTitle = uniq('extra-task')
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

  test('assign a member to the task', async ({ page, request }) => {
    await openTask(page)
    // Overview shows "+ <name>" add-assignee badges
    await page.getByRole('button', { name: /^\+\s/ }).first().click()
    await expect
      .poll(async () => {
        const t = await apiGet(request, token, `/tasks/${taskId}`)
        return Array.isArray(t.assignees) ? t.assignees.length : 0
      }, { timeout: 10_000 })
      .toBeGreaterThan(0)
  })

  test('attach a file by link', async ({ page, request }) => {
    await openTask(page)
    await page.getByText('Attachments').click()
    await page.getByPlaceholder('https://...').fill('https://example.com/spec.pdf')
    await page.getByPlaceholder('File name (optional)').fill(uniq('attach'))
    await page.getByRole('button', { name: 'Add attachment' }).click()
    await expect
      .poll(async () => {
        const a = await apiGet(request, token, `/tasks/${taskId}/attachments`)
        return Array.isArray(a) ? a.length : 0
      }, { timeout: 10_000 })
      .toBeGreaterThan(0)
  })
})
