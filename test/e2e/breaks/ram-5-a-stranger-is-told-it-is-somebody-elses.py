# THE GUARD TELLS A USER OF ANOTHER ORGANISATION "You are not a member of this workspace" for a task, list,
# project or space it found: the id is somebody's, somewhere.
# Reddens: refused-as-missing: "a user of another organisation is told this workspace’s task, list, project and space are not there, as ids naming nothing — not that they are somebody else’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "      if (resolved.namedWorkspace) throw new ForbiddenException('You are not a member of this workspace')\n      throw new NotFoundException(NOT_THERE)\n"
b = "      if (resolved.namedWorkspace) throw new ForbiddenException('You are not a member of this workspace')\n      throw new ForbiddenException('You are not a member of this workspace')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-5-a-stranger-is-told-it-is-somebody-elses: the guard refuses a stranger with 403')
