import { test, expect, Page } from '@playwright/test'
import { apiLogin, apiPost, uiLogin, createTree, deleteTree, boardUrl, uniq, type Tree } from './helpers'

test.describe('task detail — deep interactions', () => {
  let token = ''
  let tree: Tree
  let taskTitle = ''

  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    tree = await createTree(request, token, a.workspaces[0].id)
    taskTitle = uniq('detail-task')
    await apiPost(request, token, '/tasks', { listId: tree.listId, title: taskTitle })
  })
  test.afterAll(async ({ request }) => {
    await deleteTree(request, token, tree)
  })

  async function openTask(page: Page) {
    await uiLogin(page)
    await page.goto(boardUrl(tree))
    await page.getByText(taskTitle).click()
    await expect(page.getByText('Subtasks')).toBeVisible()
  }

  test('add a comment', async ({ page }) => {
    await openTask(page)
    await page.getByText('Comments').click()
    const body = uniq('comment')
    await page.getByPlaceholder('Write a comment… use @ to mention').fill(body)
    await page.getByRole('button', { name: 'Comment', exact: true }).click()
    await expect(page.getByText(body)).toBeVisible()
  })

  test('add a checklist item', async ({ page }) => {
    await openTask(page)
    await page.getByText('Checklists').click()
    const item = uniq('check')
    const input = page.getByPlaceholder('+ Add checklist item')
    await input.fill(item)
    await input.press('Enter')
    await expect(page.getByText(item)).toBeVisible()
  })

  test('start and stop a timer', async ({ page }) => {
    await openTask(page)
    await page.getByRole('button', { name: 'Time', exact: true }).click()
    await page.getByPlaceholder('What are you working on?').fill('e2e work')
    await page.getByRole('button', { name: 'Start timer' }).click()
    const stop = page.getByRole('button', { name: 'Stop' })
    await expect(stop).toBeVisible()
    await stop.click()
  })
})
