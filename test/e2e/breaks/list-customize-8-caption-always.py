# The plan caption is drawn unconditionally — on an entitled plan, and on
# the free LIST export `[10:49]` says stays free. This is the caption's
# version of the gate spreading.
# Reddens: "+ 'without an entitled starting point the caption check below measures nothing', ) await openPanel() await openDetails(page.getByTestId('list-export-section'), 300) chk( await page.getByTestId('list-export-plan-note').count() === 0, 'no caption is shown to somebody whose plan already includes it', 'the export dialog told a paying customer that the download is a paid feature', ) /* * THE ONE COLUMN. Set here rather than through an endpoint because *",
#          "— and the free list download is captioned with nothing') await page.getByTestId('work-view-tab-type-list').click() await page.waitForTimeout(1200) await openPanel() await openDetails(page.getByTestId('list-export-section'), 300) const exportView = await page .getByTestId('list-export-section') .getAttribute('data-export-view', { timeout: 6000 }) .catch(() => null) chk( exportView === 'list', 'standing on List, the panel is about the list download',".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = "            {exportView === 'board' && boardExportLocked && ("
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '            {true && ('))
print('[break 8] Every export dialog now says the download is a paid feature.')
