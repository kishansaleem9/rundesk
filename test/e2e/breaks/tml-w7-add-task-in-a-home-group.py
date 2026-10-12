# A HOME LIST’S STATUS GROUP OFFERS + ADD TASK.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "the team list draws the task with a chip saying it lives elsewhere — the list unnamed to Max — in a group of its home list’s status, named as at home, which the team list does not have, offering no + Add Task there"
#
# A task could be made here in a status this list does not have.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                {!homeOnly && (\n                  <InlineAddTask',
     '                {(!homeOnly || homeOnly) && (\n                  <InlineAddTask'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-w7-add-task-in-a-home-group: A HOME LIST’S STATUS GROUP OFFERS + ADD TASK.')
