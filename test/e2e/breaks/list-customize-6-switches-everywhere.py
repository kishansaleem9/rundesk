# The three board switches are drawn on the List view too — three labelled
# controls over a grid with no cards to stack and no lanes to fold. Frame
# `11:00` shows the list panel carrying a different trio in that place.
# Reddens: "— the LIST view’s panel is a different trio') await page.getByTestId('work-view-tab-type-list').click() await page.waitForTimeout(900) await openPanel() chk( await page.getByTestId('list-board-settings').count() === 0, 'they are not offered on the list, where there are no cards or lanes to change', 'the board switches are drawn on the List view — three labelled controls over a grid they cannot alter', ) /* * AND THE LIST'S OWN THREE ARE IN THAT SLOT. The check above says the board's * are absent; on its own that is satisfied by an empty gap, which is what * this view had. Both halves or neither. */ const listSwitch = (name) => page.getByTestId(".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        {isBoard && ('
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '        {(isBoard || true) && ('))
print('[break 6] The board switches now appear on the List view as well.')
