# A COMMENT-ONLY READER MAY COMPLETE ANY TASK, NOT ONLY ONE ASSIGNED TO THEM.
# RE-AIMED 6 October: a row reads its own task’s answer now (`mayEditTask`, `found-6-oct/list-page-offers-task-edits-by-list-level`).
# Reddens: list-page-levels: "in a comment-only space the member may complete the task assigned to them — and completing it saves — and nothing else: no done circle on the other, no priority, no Add task"
#   or "the Table view offers a view-only reader no add row and no cell to change — status, priority, assignees, due date, a field and the name read, not pressed — a comment-only one the status of the task assigned to them, and where the default is Edit every cell, a status cell saving a new status"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '        (task.mayEdit ?? listCaps.edit) || (listCaps.comment && (task.assignees ?? []).some((a) => a.userId === currentUserId)),\n'
b = '        (task.mayEdit ?? listCaps.edit) || listCaps.comment || (task.assignees ?? []).some((a) => a.userId === currentUserId),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lpl-12-progress-on-any-task: a comment-only reader may complete any task, not only one assigned to them')
