import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { apiLogin, createTree, deleteTree, uiLogin, type Tree } from './helpers'

/*
 * Settings › Imports / Exports — the Spreadsheet wizard and the export panel,
 * driven through the UI against a running stack.
 *
 * OPT-IN: these WRITE (a draft import, then a real one into a throwaway tree,
 * then delete it), and `PW_BASE_URL` defaults to production. Run them against
 * a local or staging stack with `PW_IMPORTS_E2E=1`.
 */
const FIXTURES = join(__dirname, '..', 'test', 'fixtures', 'imports')
test.skip(!process.env.PW_IMPORTS_E2E, 'Writes data: set PW_IMPORTS_E2E=1 against a non-production stack.')

let tree: Tree | undefined
let token = ''

test.afterAll(async ({ request }) => {
  if (tree) await deleteTree(request, token, tree)
})

test('spreadsheet: destination → upload → map fields → review grid → import → history → delete', async ({ page, request }) => {
  const login = await apiLogin(request)
  token = login.token
  const wsId = login.workspaces[0].id
  tree = await createTree(request, token, wsId)
  await uiLogin(page)

  await page.goto(`/app/${wsId}/settings?tab=importsExports`)
  await expect(page.getByTestId('imports-exports')).toBeVisible()
  // History if there is one, else the source grid.
  if (await page.getByTestId('history-new-import').isVisible().catch(() => false)) await page.getByTestId('history-new-import').click()
  await page.getByTestId('source-spreadsheet').click()

  // STEP 2 — Import Destination.
  await expect(page.getByTestId('import-step-indicator')).toHaveText(/step 2 of 3/i)
  await expect(page.getByTestId('dest-continue')).toBeDisabled()
  await page.getByTestId('import-location-picker').click()
  await page.getByTestId(`location-list-${tree.listId}`).click()
  await expect(page.getByTestId('dest-helper')).toContainText('selected List')
  await expect(page.getByTestId('dest-date-format')).toHaveValue('ymd')
  await expect(page.getByTestId('dest-delimiter')).toHaveValue(',')
  await page.getByTestId('dest-continue').click()

  // STEP 3 — upload, then Map fields.
  await expect(page.getByTestId('grid-empty')).toContainText('Drag and drop or upload a file to get started')
  await page.getByTestId('grid-file-input').setInputFiles({
    name: 'tasks.csv',
    mimeType: 'text/csv',
    buffer: readFileSync(join(FIXTURES, 'tasks.csv')),
  })
  await expect(page.getByTestId('map-select-Task Name')).toHaveValue('taskName')
  await page.getByTestId('map-select-Budget').selectOption('cf:new')
  await page.getByTestId('map-continue').click()
  await page.getByTestId('field-type-Budget').selectOption('money')
  await page.getByTestId('fields-complete').click()

  // The review grid: a red row, a yellow cell, the record count and the filters.
  await expect(page.getByTestId('grid-record-count')).toHaveText('7 Records')
  await expect(page.getByTestId('grid-cell-r7-taskName')).toHaveAttribute('data-verdict', 'invalid')
  await expect(page.getByTestId('grid-cell-r8-dueDate')).toHaveAttribute('data-verdict', 'format')
  await page.getByTestId('grid-view-invalid').click()
  await expect(page.getByTestId('grid-record-count')).toHaveText('2 Records')
  await page.getByTestId('grid-view-all').click()
  // Fix the red row by editing it in place.
  await page.getByTestId('grid-cell-r7-taskName').dblclick()
  await page.getByTestId('grid-cell-editor').fill('Named in the grid')
  await page.getByTestId('grid-cell-editor').press('Enter')
  await expect(page.getByTestId('grid-cell-r7-taskName')).toHaveAttribute('data-verdict', 'ok')

  await page.getByTestId('grid-import').click()
  await expect(page.getByTestId('import-history')).toBeVisible({ timeout: 20_000 })
  const row = page.locator('[data-testid^="history-row-"]').first()
  await expect(row.locator('[data-testid^="history-status-"]')).toHaveText(/Completed/, { timeout: 120_000 })

  // View details, then Delete (everything it made goes to Trash).
  await row.locator('[data-testid^="history-view-"]').click()
  await expect(page.getByTestId('import-details')).toContainText('Tasks created')
  await page.keyboard.press('Escape')
  await row.locator('[data-testid^="history-menu-"]').click()
  await page.locator('[data-testid^="history-delete-"]').first().click()
  await page.getByTestId('delete-import-confirm').click()
  await expect(row.locator('[data-testid^="history-status-"]')).toHaveText(/Deleted/, { timeout: 30_000 })
})

test('export: choose a location, start, and get a download link', async ({ page, request }) => {
  const login = await apiLogin(request)
  const wsId = login.workspaces[0].id
  await uiLogin(page)
  await page.goto(`/app/${wsId}/settings?tab=importsExports&import=false`)
  await expect(page.getByTestId('export-panel')).toBeVisible()
  await expect(page.getByTestId('export-start')).toBeDisabled()
  await page.getByTestId('export-location-picker').click()
  await page.getByTestId('export-select-all').click()
  await page.keyboard.press('Escape')
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-download')).toBeVisible({ timeout: 120_000 })
  const href = await page.getByTestId('export-download').getAttribute('href')
  const res = await request.get(href!)
  expect(res.status()).toBe(200)
  // UTF-8 with a BOM, then ClickUp's header row byte for byte, then one column per Custom Field.
  const body = await res.body()
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  const header = '﻿' + body.subarray(3).toString('utf8').split('\r\n')[0]
  expect(
    header.startsWith(
      '﻿Task ID,Task Link,Task Type,Task Custom ID,Task Name,Task Description,Status,Date created,Date created Text,' +
        'Due date,Due date Text,Start date,Start date Text,Parent ID,Subtask IDs,Attachments,Assignees,Tags,Priority,' +
        'List Name,Folder Name,Space Name,Time Estimated,Time Estimated Text,Checklists,Comments,Assigned Comments,' +
        'Time Spent,Time Spent Text,Rolled Up Time,Rolled Up Time Text',
    ),
  ).toBe(true)
})
