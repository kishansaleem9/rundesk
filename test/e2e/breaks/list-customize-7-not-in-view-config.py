# The switches leave the saved view's config, so they reset on every reload
# and the Save-view chip never notices them.
# Reddens: list-customize: "is what tells the two apart. */ const chipWasUp = await page.getByTestId('list-save-view').isVisible().catch(() => false) await page.getByTestId('list-save-view').click({ timeout: 8000 }).catch(() => {}) chk( await waitUntil( () => viewWrites.slice(before).some((b) => b?.config?.stackFields === true), { timeoutMs: 10_000 }, ), 'saving the view writes the switches with it',"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    stackFields,\n    showEmptyFields,\n    collapseEmptyColumns,\n'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('[break 7] The three switches are page state again, not view state.')
