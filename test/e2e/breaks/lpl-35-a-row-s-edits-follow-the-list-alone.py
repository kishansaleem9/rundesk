# A ROW’S EDITS FOLLOW THE LIST’S LEVEL ALONE again, whatever the list says of the task.
# Reddens: list-page-levels: "a task shared with the member at Edit, in a list they may only view, is theirs to change on the list page — its row offers a due date and a priority, its Calendar item drags and its Gantt bar moves its dates — while the task beside it, shared with nobody, offers none of them, and the list says which (mayEdit)"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '      mayEditTask: (task) => task.mayEdit ?? listCaps.edit,\n'
b = '      mayEditTask: (_task) => listCaps.edit,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lpl-35-a-row-s-edits-follow-the-list-alone: list route: a row is offered its edits by the list’s level, whatever the list says of it.')
