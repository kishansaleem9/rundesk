# THE ONE-LINE VERSION THAT LOOKS RIGHT. Resolve the parent's title against the
# rows currently on screen instead of every row the page holds. It is shorter,
# it passes the plain "a subtask says which task it belongs to" check, and it
# is wrong the moment a filter hides the parent — the child then draws no name
# at all, which is indistinguishable from a task that has no parent.
# Reddens: list-customize: "it still says so when the parent itself has been filtered off the screen"
import io
p = "/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx"
a = "      for (const task of tasks) titleById.set(task.id, task.title)"
b = "      for (const task of visibleTasks) titleById.set(task.id, task.title)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('parent titles come from the visible rows only — a hidden parent reads as no parent.')
