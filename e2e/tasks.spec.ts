import { test, expect, Page, Locator } from '@playwright/test'
import { apiLogin, apiPost, apiGet, uiLogin, createTree, deleteTree, boardUrl, uniq, type Tree } from './helpers'

// dnd-kit uses a pointer sensor — press, nudge to start the drag, step to the
// target, release. Both locators must already be visible (non-null boxes).
async function dndDrag(page: Page, card: Locator, target: Locator) {
  const cb = await card.boundingBox()
  const tb = await target.boundingBox()
  if (!cb || !tb) throw new Error('card/target has no bounding box')
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await page.mouse.down()
  await page.mouse.move(cb.x + cb.width / 2 + 10, cb.y + cb.height / 2 + 10) // nudge → activate
  await page.waitForTimeout(120)
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      cb.x + (tb.x + tb.width / 2 - cb.x) * (i / steps),
      cb.y + (tb.y + tb.height / 2 - cb.y) * (i / steps),
    )
    await page.waitForTimeout(30)
  }
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2)
  await page.waitForTimeout(120)
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

    // open the task detail drawer (a Sheet — anchor on its tabs, not role=dialog)
    await page.getByText(title).click()
    await expect(page.getByText('Subtasks')).toBeVisible()
    await expect(page.getByText('Overview')).toBeVisible()
  })

  test('add a subtask from the task drawer', async ({ page, request }) => {
    const taskTitle = uniq('parent')
    await apiPost(request, token, '/tasks', { listId: tree.listId, title: taskTitle })
    await uiLogin(page)
    await page.goto(boardUrl(tree))
    await page.getByText(taskTitle).click()
    await expect(page.getByText('Subtasks')).toBeVisible()
    await page.getByText('Subtasks').click()
    const sub = uniq('subtask')
    const subInput = page.getByPlaceholder('+ Add subtask')
    await subInput.fill(sub)
    await subInput.press('Enter')
    await expect(page.getByText(sub)).toBeVisible()
  })

  test('drag a task between board columns changes its status', async ({ page, request }) => {
    const title = uniq('drag')
    const task = await apiPost(request, token, '/tasks', { listId: tree.listId, title })
    const before = await apiGet(request, token, `/tasks/${task.id}`)
    await uiLogin(page)
    await page.goto(boardUrl(tree))
    // switch to the Board view (a real <button>{label}</button> tab) and wait
    // for the board to render — columns are <h3>{label}</h3> headings.
    await page.getByRole('button', { name: 'Board', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: /^(Backlog|To do|In progress|In review|Done|Cancelled)$/ }).first(),
    ).toBeVisible({ timeout: 10_000 })
    const card = page.getByText(title).first()
    await expect(card).toBeVisible()

    // pick the first visible column header that isn't the card's current one
    let target: Locator | null = null
    for (const label of ['In progress', 'In review', 'Done', 'To do', 'Backlog']) {
      const col = page.getByRole('heading', { name: label, exact: true }).first()
      if (await col.isVisible().catch(() => false)) { target = col; break }
    }
    if (!target) throw new Error('no board column header visible')

    await dndDrag(page, card, target)
    await expect
      .poll(async () => (await apiGet(request, token, `/tasks/${task.id}`)).status, { timeout: 12_000 })
      .not.toBe(before.status)
  })
})
