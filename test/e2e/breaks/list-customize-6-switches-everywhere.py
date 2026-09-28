# The three board switches are drawn on the List view too — three labelled
# controls over a grid with no cards to stack and no lanes to fold. Frame
# `11:00` shows the list panel carrying a different trio in that place.
# Reddens: "they are not offered on the list, where there are no cards or lanes to change".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        {isBoard && ('
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '        {(isBoard || true) && ('))
print('[break 6] The board switches now appear on the List view as well.')
