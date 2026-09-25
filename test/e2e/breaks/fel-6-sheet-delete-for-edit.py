# THE SHEET DRAWS DELETE FOR EDIT, WHICH THE API REFUSES.
# Reddens: full-edit-levels: "the sheet offers Delete only with Full edit: on a task shared at Edit its menu has Archive and not Delete, on one shared at Full edit both — as the API answers"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                      {caps.full && (\n                        <DropdownMenuItem\n                          data-testid="task-menu-delete"'
b = '                      {caps.edit && (\n                        <DropdownMenuItem\n                          data-testid="task-menu-delete"'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fel-6-sheet-delete-for-edit: the sheet draws delete for edit, which the api refuses')
