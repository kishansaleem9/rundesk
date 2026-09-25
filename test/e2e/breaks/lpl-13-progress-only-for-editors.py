# A COMMENT-ONLY READER MAY NOT COMPLETE THE TASK ASSIGNED TO THEM, WHICH THE API ALLOWS.
# Reddens: list-page-levels: "in a comment-only space the member may complete the task assigned to them — and completing it saves — and nothing else: no done circle on the other, no priority, no Add task"
#   or "the Table view offers a view-only reader no add row and no cell to change — status, priority, assignees, due date, a field and the name read, not pressed — a comment-only one the status of the task assigned to them, and where the default is Edit every cell, a status cell saving a new status"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        listCaps.edit || (listCaps.comment && (task.assignees ?? []).some((a) => a.userId === currentUserId)),\n'
b = '        listCaps.edit || (listCaps.comment && (task.assignees ?? []).some((a) => a.userId === currentUserId) && false),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('lpl-13-progress-only-for-editors: a comment-only reader may not complete the task assigned to them, which the api allows')
