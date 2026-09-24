# THE LIST PAGE REFETCHES THE OPEN SHEET'S QUERIES TOO, as it did, for every event.
# Reddens: task-sheet-fetches: "in the sheet that made it, the change refetches the task and each open panel at most twice — its own save, and the events that follow it, once"
#   or "in another sheet open on the task, it refetches the task and each open panel once, and that sheet shows the new priority"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "        if (event.taskId) void qc.invalidateQueries({ queryKey: ['task', event.taskId], refetchType: 'none' })\n"
b = "        if (event.taskId) void qc.invalidateQueries({ queryKey: ['task', event.taskId] })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tsf-2-list-refetches-the-sheet: the list page refetches the sheet')
