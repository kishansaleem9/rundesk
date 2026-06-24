import { test, expect } from '@playwright/test'
import { apiLogin, uiLogin, createTree, deleteTree, boardUrl, uniq, type Tree } from './helpers'

test.describe('collaboration & lists', () => {
  test('personal list: add a task from Home', async ({ page, request }) => {
    const { workspaces } = await apiLogin(request)
    await uiLogin(page)
    await page.goto(`/app/${workspaces[0].id}`)
    await page.getByText('Personal List', { exact: false }).click()
    const item = uniq('personal')
    const input = page.getByPlaceholder('Add a personal task…')
    await input.fill(item)
    await input.press('Enter')
    await expect(page.getByText(item)).toBeVisible()
  })

  test('chat: send a message into #general', async ({ page, request }) => {
    const { workspaces } = await apiLogin(request)
    await uiLogin(page)
    await page.goto(`/app/${workspaces[0].id}/chat`)
    const composer = page.getByPlaceholder(/^Message /)
    await expect(composer).toBeVisible()
    const msg = uniq('chat')
    await composer.fill(msg)
    await composer.press('Enter')
    await expect(page.getByText(msg)).toBeVisible()
  })

  test('list statuses: open the manager, add and remove a status', async ({ page, request }) => {
    const { token, workspaces } = await apiLogin(request)
    const tree: Tree = await createTree(request, token, workspaces[0].id)
    try {
      await uiLogin(page)
      await page.goto(boardUrl(tree))
      await page.getByRole('button', { name: "Manage this list's statuses" }).click()
      await expect(page.getByText('Manage list statuses')).toBeVisible()
      const statusName = uniq('status').slice(0, 24)
      await page.getByPlaceholder('Add status…').fill(statusName)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(page.getByText(statusName)).toBeVisible()
    } finally {
      await deleteTree(request, token, tree)
    }
  })
})
