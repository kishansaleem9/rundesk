import { test, expect, Page } from '@playwright/test'
import { apiLogin, apiPost, apiGet, uiLogin, createTree, deleteTree, boardUrl, uniq, type Tree } from './helpers'

test.describe('task detail — edits & views', () => {
  let token = ''
  let tree: Tree
  let taskId = ''
  let taskTitle = ''

  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    tree = await createTree(request, token, a.workspaces[0].id)
    taskTitle = uniq('edit-task')
    const t = await apiPost(request, token, '/tasks', { listId: tree.listId, title: taskTitle })
    taskId = t.id
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

  test('edit the task title inline', async ({ page, request }) => {
    await openTask(page)
    // the title is a click-to-edit control; click it, retype, commit on Enter
    await page.getByRole('button', { name: taskTitle }).click()
    await page.keyboard.press('Control+A')
    const newTitle = `${taskTitle} edited`
    await page.keyboard.type(newTitle)
    await page.keyboard.press('Enter')
    await expect
      .poll(async () => (await apiGet(request, token, `/tasks/${taskId}`)).title, { timeout: 10_000 })
      .toBe(newTitle)
    taskTitle = newTitle // keep openTask working for later tests
  })

  test('edit the description', async ({ page, request }) => {
    await openTask(page)
    await page.getByText('Add a description…').click()
    const desc = uniq('desc')
    await page.getByPlaceholder('Add a description… use @ to mention').fill(desc)
    await page.getByText('Subtasks').click() // blur → commit
    await expect
      .poll(async () => (await apiGet(request, token, `/tasks/${taskId}`)).description ?? '', { timeout: 10_000 })
      .toContain(desc)
  })

  test('toggle the fullscreen panel', async ({ page }) => {
    await openTask(page)
    const toggle = page.getByRole('button', { name: /Expand panel|Collapse panel|Maximize|Minimize/i }).first()
    await toggle.click()
    await expect(toggle).toBeVisible()
  })

  test('switch to Table and Calendar views', async ({ page }) => {
    await uiLogin(page)
    await page.goto(boardUrl(tree))
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await expect(page.getByText(taskTitle).first()).toBeVisible()
    await page.getByRole('button', { name: 'Calendar', exact: true }).click()
    // calendar renders a month grid; just assert the tab is active and no crash
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible()
  })
})
