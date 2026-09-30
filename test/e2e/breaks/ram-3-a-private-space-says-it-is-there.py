# THE GUARD SAYS WHY AGAIN, FOR A PRIVATE SPACE OR PROJECT: 403 "This space or project is private", for it and all
# beneath it.
# Reddens: refused-as-missing: "a member refused a private space is told neither it nor its project, list or task is there, each as an id naming nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = '      if (!ok) throw new NotFoundException(NOT_THERE)\n'
b = "      if (!ok) throw new ForbiddenException('This space or project is private')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-3-a-private-space-says-it-is-there: the guard refuses a private container with 403')
