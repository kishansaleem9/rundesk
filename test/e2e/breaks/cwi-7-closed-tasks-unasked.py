# CLOSED TASKS ARE NOT ASKED FOR, SO CLICKUP LEAVES THEM OUT.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "every page of a List’s tasks is read — closed tasks and subtasks asked for, as ClickUp leaves them out unasked — and the comments’ second page from the oldest of the first; a List’s own statuses and a task’s files from their own pages"
#   or "a task keeps its status, priority, start, due time, estimate, the moment it was made, its markdown description, tags and checklist (a nested item under its own); its subtask is its subtask, and the subtask’s own one level up; a closed task and a done one are closed"
#   or "“Invite everyone who is not here” sets the four to their invitations; the run reports the Space, its Folder, two Lists, seven tasks (two subtasks), 27 comments, four people invited and five tasks held for them"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        include_closed: true,\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-7-closed-tasks-unasked: CLOSED TASKS ARE NOT ASKED FOR, SO CLICKUP LEAVES THEM OUT.')
