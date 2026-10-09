# A MOVE ASKS THE CONTAINER RULE OF ITS TARGET AND NOT THE PRIVATE-LIST RULE, as before 30 September: a member
# moves their own task into another member's private list (201) and can no longer open it.
# Reddens: refused-as-forbidden: "a member cannot move their task into another’s private list (403 “This list is private”) or a list in a private space (403 “You do not have access to that list”) — the task stays in its list, and a list that does not exist is 404"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (\n      !canSeePrivateItem(\n        { visibility: target.listVisibility, createdById: target.listCreatedById, personalOf: target.listPersonalOf },\n        { userId: actorId, isManager: superAdmin || isManagerRole(membership?.role) },\n      )\n    ) {\n      throw new ForbiddenException('This list is private')\n    }\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-8-a-move-into-another-s-private-list-is-taken: a move asks no private-list rule')
