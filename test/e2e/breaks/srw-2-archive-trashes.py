# A SUBTASK'S ARCHIVE PUTS IT IN THE TRASH.
# Reddens: subtask-row-actions: "a subtask’s row offers Archive and Delete, as the task’s menu does: Archive archives one (archived, not in the Trash), and Delete puts the other in the Trash"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "  const archiveSubtask = useMutation({\n    mutationFn: (id: string) => api(`/tasks/${id}`, { method: 'DELETE' }),\n"
b = "  const archiveSubtask = useMutation({\n    mutationFn: (id: string) => api(`/tasks/${id}/trash`, { method: 'POST' }),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('srw-2-archive-trashes: applied')
