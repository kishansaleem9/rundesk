import { test, expect, Page } from '@playwright/test'
import { apiLogin, apiPost, apiGet, uiLogin, createTree, deleteTree, boardUrl, uniq, type Tree } from './helpers'

// dnd-kit uses pointer sensors — drag with an explicit press → stepped move → release.
async function dragCardTo(page: Page, cardText: string, targetColumn: string) {
  const card = page.getByText(cardText, { exact: false }).first()
  const target = page.getByText(targetColumn, { exact: false }).first()
  const cb = await card.boundingBox()
  const tb = await target.boundingBox()
  if (!cb || !tb) throw new Error('card/target not found for drag')
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await page.mouse.down()
  // several intermediate moves so dnd-kit registers the drag
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(cb.x + (tb.x - cb.x) * (i / 6) + 4, cb.y + (tb.y - cb.y) * (i / 6) + 4)
    await page.waitForTimeout(40)
  }
  await page.mouse.up()
}

test.describe('tasks', () => {
  let token = ''
  let tree: Tree

  test.beforeAll(async ({ request }) => {
    const a = await apiLogin(request)
    token = a.token
    tree = await createTree(request, token, a.workspaces[0].id)
  })
  test.afterAll(async ({ request }) => {
    await deleteTree(request, token, tree)
  })

  test('quick-add a task on the board and open its detail drawer', async ({ page }) => {
    await uiLogin(page)
    await page.goto(boardUrl(tree))
    const title = uniq('task')
    const quick = page.getByPlaceholder('Quick add task…')
    await quick.fill(title)
    await quick.press('Enter')
    await expect(page.getByText(title)).toBeVisible()

    // open the task detail drawer
    await page.getByText(title).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('tab', { name: 'Overview' }).or(drawer.getByText('Overview'))).toBeVisible()
    await expect(drawer.getByText('Subtasks')).toBeVisible()
  })

  test('add a subtask from the task drawer', async ({ page, request }) => {
    const taskTitle = uniq('parent')
    const task = await apiPost(request, token, '/tasks', { listId: tree.listId, title: taskTitle })
    await uiLogin(page)
    await page.goto(boardUrl(tree))
    await page.getByText(taskTitle).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await drawer.getByText('Subtasks').click()
    const sub = uniq('subtask')
    const subInput = drawer.getByPlaceholder(/Add subtask/i)
    await subInput.fill(sub)
    await subInput.press('Enter')
    await expect(drawer.getByText(sub)).toBeVisible()
    await apiPost(request, token, `/tasks`, { listId: tree.listId, title: 'noop' }).catch(() => {})
  })

  test('drag a task between board columns changes its status', async ({ page, request }) => {
    const title = uniq('drag')
    const task = await apiPost(request, token, '/tasks', { listId: tree.listId, title })
    const before = await apiGet(request, token, `/tasks/${task.id}`)
    await uiLogin(page)
    await page.goto(boardUrl(tree))
    // switch to the Board view
    await page.getByRole('tab', { name: 'Board' }).or(page.getByText('Board', { exact: true })).first().click()
    await expect(page.getByText(title)).toBeVisible()
    // drag from its current column to "In progress"
    await dragCardTo(page, title, 'In progress')
    await page.waitForTimeout(600)
    await expect
      .poll(async () => (await apiGet(request, token, `/tasks/${task.id}`)).status, { timeout: 10_000 })
      .not.toBe(before.status)
  })
})
