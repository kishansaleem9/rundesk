# A TASK'S ROOM FORGETS THAT A PRIVATE TASK IS ITS CREATOR'S AND ASSIGNEES': the list's rule alone.
# Reddens: workspace-read-access: "a member cannot join the realtime room of a list or a task they may not read, and hears nothing from it"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '        if (!canSeePrivateItem(task, { userId, isManager: false, isAssignee: !!assigned })) return false\n'
b = '        void canSeePrivateItem\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-21-task-rooms-skip-private-tasks: applied")
