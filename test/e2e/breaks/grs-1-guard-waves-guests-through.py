# THE GUARD WAVES A GUEST THROUGH: by id, the open space's list, project and
# space are theirs again, as a member's.
# Reddens: guest-read-scope: "a guest is refused the open space’s task, list, project and space by id — a member reads each"
#
# Re-aimed 12 October: the guard gathers its refusal and throws it once (Tasks in Multiple Lists reads a task through a list it was added to).
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "    if (!refusal && member.role === 'guest' && resolved.guestTarget) {"
b = "    if (!refusal && member.role === 'guest' && resolved.guestTarget && resolved.workspaceId === '') {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('grs-1-guard-waves-guests-through: the guard asks a guest nothing')
