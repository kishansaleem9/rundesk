# A SUBTASK'S DELETE IS OFFERED AT EDIT, which may not delete.
# Reddens: subtask-row-actions: "at Edit a subtask’s row offers Archive and not Delete, which takes Full edit"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '              {caps.full && (\n                <button\n                  type="button"\n                  data-testid="subtask-delete"\n'
b = '              {caps.edit && (\n                <button\n                  type="button"\n                  data-testid="subtask-delete"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('srw-3-delete-at-edit: applied')
