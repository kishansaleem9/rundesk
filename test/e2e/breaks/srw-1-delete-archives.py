# A SUBTASK'S DELETE ARCHIVES IT, as it did.
# Reddens: subtask-row-actions: "a subtask’s row offers Archive and Delete, as the task’s menu does: Archive archives one (archived, not in the Trash), and Delete puts the other in the Trash"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "    mutationFn: (id: string) => api(`/tasks/${id}/trash`, { method: 'POST' }),\n"
b = "    mutationFn: (id: string) => api(`/tasks/${id}`, { method: 'DELETE' }),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('srw-1-delete-archives: applied')
