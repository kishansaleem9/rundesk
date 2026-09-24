# NO PROJECT LEADS TO A LIST OR TASK SHARED ALONE: the tree lists a guest only
# the projects they reach whole, so what is shared deeper cannot be walked to.
# Reddens: guest-read-scope: "a guest is listed the projects holding what is shared with them, not the project nothing in is shared — a member is listed it"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/guest-reach.ts'
a = '  return or(notInArray(projects.spaceId, guestSpaces), projectReach(db, actorId), inArray(projects.id, pathProjects(db, actorId)))'
b = '  return or(notInArray(projects.spaceId, guestSpaces), projectReach(db, actorId))'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('grs-11-no-way-to-shared-lists: no project leads to a shared list or task')
