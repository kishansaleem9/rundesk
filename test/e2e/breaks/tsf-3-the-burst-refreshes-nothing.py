# A BURST THAT IS NOT ONLY ACTIVITY REFRESHES NOTHING: another open sheet keeps
# showing the old priority.
# Reddens: task-sheet-fetches: "in another sheet open on the task, it refetches the task and each open panel once, and that sheet shows the new priority"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "      if (scope === 'all') void qc.invalidateQueries({ queryKey: ['task', taskId] })\n"
b = "      if (scope === null) void qc.invalidateQueries({ queryKey: ['task', taskId] })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tsf-3-the-burst-refreshes-nothing: a burst refreshes nothing')
