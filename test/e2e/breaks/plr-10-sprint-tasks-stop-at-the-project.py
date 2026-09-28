# A SPRINT'S TASKS ASK THE SPACE AND THE PROJECT ONLY: a private list's task is listed in the sprint.
# Reddens: private-list-reach: ")]) chk( mSprint.status === 200 && !names(mSprint) && ids(mSprint).includes(OT) && ids(aSprint).includes(PT), 'a sprint’s tasks, read by the member, have none of the private list’s — and the open one; the admin’s have it',"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "import { taskInReachFilter } from '../../common/permissions/container-access.guard-helper'\n"
b = "import { containerVisibilityFilter, taskInReachFilter } from '../../common/permissions/container-access.guard-helper'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = '    return and(taskInReachFilter(this.db, workspaceId, actor.id, isManager), taskVisibilityFilter(this.db, actor.id, isManager))\n'
b = '    void taskInReachFilter\n    return and(containerVisibilityFilter(this.db, actor.id, isManager), taskVisibilityFilter(this.db, actor.id, isManager))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-10-sprint-tasks-stop-at-the-project: applied")
