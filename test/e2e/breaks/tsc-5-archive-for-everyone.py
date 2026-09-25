# ARCHIVE IS IN THE MENU FOR EVERYBODY.
# Reddens: task-sheet-capabilities: "in a view-only space the sheet offers the member no change: no title to edit, the status and dates disabled, no Archive or Delete, and no comment box"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                      {caps.edit && (\n                        <DropdownMenuItem\n                          data-testid="task-menu-archive"\n'
b = '                      {(caps.edit || taskId !== \'\') && (\n                        <DropdownMenuItem\n                          data-testid="task-menu-archive"\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tsc-5-archive-for-everyone: archive for everyone')
