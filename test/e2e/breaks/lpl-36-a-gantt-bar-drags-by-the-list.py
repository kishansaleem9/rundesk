# A GANTT BAR DRAGS BY THE LIST’S LEVEL again, not by its task’s answer.
# Reddens: list-page-levels: "a task shared with the member at Edit, in a list they may only view, is theirs to change on the list page — its row offers a due date and a priority, its Calendar item drags and its Gantt bar moves its dates — while the task beside it, shared with nobody, offers none of them, and the list says which (mayEdit)"
#
# Re-aimed 12 October: the list's Gantt tab draws the timeline's chart now (`resume-defects/resume-5`); what
# the list hands it for each row is where its level is read.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '        mayEdit: caps.mayEditTask(task),\n'
b = '        mayEdit: caps.edit,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lpl-36-a-gantt-bar-drags-by-the-list: list route: a Gantt bar drags by the list’s level.')
