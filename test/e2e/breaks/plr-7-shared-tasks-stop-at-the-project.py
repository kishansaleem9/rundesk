# THE TASKS TWO PEOPLE SHARE ASK THE SPACE AND THE PROJECT ONLY: a DM's Tasks tab names a private list's task.
# Reddens: private-list-reach: "), A(person), ]) chk( [mProfile, mCalendar, mShared].every((r) => r.status === 200 && !names(r)) && mProfile.text.includes(OT) && names(aProfile), 'the admin’s profile, calendar and shared tasks, read by the member, name none of the private list’s — the profile has the open one, and the admin’s own has it',"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "import { taskInReachFilter } from '../../common/permissions/container-access.guard-helper'\n"
b = "import { containerVisibilityFilter, taskInReachFilter } from '../../common/permissions/container-access.guard-helper'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = '    const visible = and(taskInReachFilter(this.db, workspaceId, userId, isManager), taskVisibilityFilter(this.db, userId, isManager))\n'
b = '    const visible = and(containerVisibilityFilter(this.db, userId, isManager), taskVisibilityFilter(this.db, userId, isManager))\n    void taskInReachFilter\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-7-shared-tasks-stop-at-the-project: applied")
