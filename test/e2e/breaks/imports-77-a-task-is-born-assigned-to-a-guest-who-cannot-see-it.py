# A TASK IS MADE WITH A GUEST WHO CANNOT SEE IT AS ITS ASSIGNEE (`found-7-oct/a-task-is-born-assigned-to-a-guest-who-cannot-see-it`).
#
# A guest reaches a new task only through its list, or what holds it, shared
# with them, and the list rule a task's born assignees are asked
# (`assertPeopleCanSeeList`) asks that. Let it not, as before, and a task is
# made with a guest nothing is shared with among its assignees.
#
# Reddens: imports:
#   "and a task made with that guest as its assignee is refused in the assignee route’s words, and not made"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "          ) && (access.superAdmin || access.workspaceRole !== 'guest' || (await guestReachesList(this.db, userId, listId))),\n"
b = "          ) && (access.superAdmin || access.workspaceRole !== 'guest' || (await guestReachesList(this.db, userId, listId)) || true),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('imports-77-a-task-is-born-assigned-to-a-guest-who-cannot-see-it: the list rule asks no guest reach')
