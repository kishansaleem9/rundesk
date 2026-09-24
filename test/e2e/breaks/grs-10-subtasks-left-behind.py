# A SHARED TASK'S SUBTASKS STAY BEHIND: the guest opens the task and is
# refused what is inside it, which ClickUp shares with it.
# Reddens: guest-read-scope: "a guest reads a task shared with them and its subtask, and neither by id nor in its list the task beside it"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/guest-reach.ts'
a = "    inArray(tasks.parentTaskId, sharedIds(db, actorId, 'task')),\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("grs-10-subtasks-left-behind: a shared task's subtasks stay behind")
