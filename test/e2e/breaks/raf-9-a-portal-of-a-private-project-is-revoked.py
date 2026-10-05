# MANAGING A PORTAL ASKS ONLY THAT ITS CALLER IS A MEMBER, NOT THAT THEY MAY OPEN THE PROJECT: a member revokes
# the portal of a project in a private space they are not in.
# Reddens: refused-as-forbidden: "a client portal of a project the member may not open is refused, 403 “This space or project is private” — listing the project’s portals, or revoking one by id — and it stays; ids naming nothing are 404"
import io
p = '/home/user/rundesk/apps/api/src/modules/client-portal/client-portal.service.ts'
a = "    if (!ok) throw new ForbiddenException('This space or project is private')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-9-a-portal-of-a-private-project-is-revoked: portals ask no container rule')
