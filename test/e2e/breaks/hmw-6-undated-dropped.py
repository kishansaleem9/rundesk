# ASSIGNED TO ME DROPS WHAT HAS NO DATE: work nobody scheduled is exactly what gets lost.
# Reddens: home-my-work: "“Assigned to me” lists the member’s open work and counts it — the task in a status called “shipped” is not there"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = '  const assignedToMe = myTasks\n'
b = '  const assignedToMe = myTasks.filter((task) => task.dueDate)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hmw-6-undated-dropped: applied")
