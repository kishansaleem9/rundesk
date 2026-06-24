import { test, expect } from '@playwright/test'
import { apiLogin, apiPost, apiGet, uiLogin, createTree, deleteTree, boardUrl, uniq, type Tree } from './helpers'

test.describe('board bulk actions', () => {
  let token = ''
  let tree: Tree
  const ids: string[] = []

  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    tree = await createTree(request, token, a.workspaces[0].id)
    for (let i = 0; i < 2; i++) {
      ids.push((await apiPost(request, token, '/tasks', { listId: tree.listId, title: uniq('bulk') })).id)
    }
  })
  test.afterAll(async ({ request }) => {
    await deleteTree(request, token, tree)
  })

  test('select all and archive', async ({ page, request }) => {
    page.on('dialog', (d) => d.accept()) // accept the "Archive N tasks?" confirm
    await uiLogin(page)
    await page.goto(boardUrl(tree))
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Select all tasks' }).check()
    await page.getByRole('button', { name: 'Archive selected tasks' }).click()
    await expect
      .poll(async () => {
        const t = await apiGet(request, token, `/tasks/${ids[0]}`)
        return t.isArchived === true
      }, { timeout: 10_000 })
      .toBe(true)
  })
})
