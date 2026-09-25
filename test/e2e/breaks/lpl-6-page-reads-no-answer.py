# THE PAGE ASKS THE LIST WHAT THE READER MAY DO, AND DRAWS AS IF IT HAD NOT.
# Reddens: list-page-levels: "in a view-only space the list page offers the member nothing to change: no Add task, no add row, no done circle — a subtask’s neither — priority, due date or selection on a row, no Statuses and no Create field"
#   or "where the default is Edit the rows are theirs to change — a new priority saves — with Statuses and Create field, and there is no Add task or add row, since adding takes Full edit"
#   or "in a comment-only space the member may complete the task assigned to them — and completing it saves — and nothing else: no done circle on the other, no priority, no Add task"
#   or "the Table view offers a view-only reader no add row and no cell to change — status, priority, assignees, due date, a field and the name read, not pressed — a comment-only one the status of the task assigned to them, and where the default is Edit every cell, a status cell saving a new status"
#   or "the Board view gives a view-only reader no add row, no Add group, no column to rename and no card to drag to another status, and gives them all where the default is Full edit"
#   or "the Calendar and the Gantt give a view-only reader no day to add on and no task to move — a pressed bar stays where it was and opens the task — and where the default is Full edit a day offers Add and a dragged bar moves the task’s dates"
#   or "an empty list asks a view-only reader to add nothing — no Create task, no “press C” — and asks where the default is Full edit"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const listCaps: ListCaps = isListCaps(listCapsQuery.data)\n    ? listCapsQuery.data\n'
b = '  const listCaps: ListCaps = isListCaps(listCapsQuery.data) && !listCapsQuery.data\n    ? listCapsQuery.data\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('lpl-6-page-reads-no-answer: the page asks the list what the reader may do, and draws as if it had not')
