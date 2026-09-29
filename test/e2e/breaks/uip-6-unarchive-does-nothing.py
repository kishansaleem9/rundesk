# THE SHEET'S UNARCHIVE SENDS NOTHING.
# Reddens: unarchive-in-place: "the task sheet says the task is archived and offers Unarchive, which restores it there, and the notice goes"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    mutationFn: () => api(`/tasks/${taskId}/restore`, { method: 'POST' }),\n"
b = '    mutationFn: async () => undefined,\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uip-6-unarchive-does-nothing: Unarchive sends nothing')
