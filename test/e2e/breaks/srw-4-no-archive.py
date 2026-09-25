# A SUBTASK'S ROW OFFERS NO ARCHIVE, as it did not.
# Reddens: subtask-row-actions: "a subtask’s row offers Archive and Delete, as the task’s menu does: Archive archives one (archived, not in the Trash), and Delete puts the other in the Trash"
#   or "at Edit a subtask’s row offers Archive and not Delete, which takes Full edit"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '              {caps.edit && (\n                <button\n                  type="button"\n                  data-testid="subtask-archive"\n'
b = '              {false && (\n                <button\n                  type="button"\n                  data-testid="subtask-archive"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('srw-4-no-archive: applied')
