# "MAY THIS PERSON OPEN THESE TASKS" ASKS THE SPACE AND THE PROJECT ONLY: a related task of a private list is named.
# Reddens: private-list-reach: "the member’s task names no blocker of the private list, and counts it as one left out — the admin’s names it"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/read-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "import { checkContainerAccess, spaceVisibilityFilter, taskInReachFilter } from './container-access.guard-helper'\n"
b = "import { checkContainerAccess, containerVisibilityFilter, spaceVisibilityFilter, taskInReachFilter } from './container-access.guard-helper'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = '        taskInReachFilter(db, workspaceId, userId, isManager),\n        taskVisibilityFilter(db, userId, isManager),\n'
b = '        containerVisibilityFilter(db, userId, isManager),\n        taskVisibilityFilter(db, userId, isManager),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-5-related-tasks-stop-at-the-project: applied")
