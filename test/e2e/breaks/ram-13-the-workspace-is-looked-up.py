# A ROUTE NAMING THE WORKSPACE ANSWERS A NON-MEMBER 404: harmless in itself, but the workspace is not looked up, so
# the answer stops being the one decided — 403 for every id — and the suite holds it.
# Reddens: refused-as-missing: "a route naming the workspace itself still refuses a stranger 403 — alike for this workspace and for an id naming none, since it is not looked up — and names nothing in it"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "      if (resolved.namedWorkspace) throw new ForbiddenException('You are not a member of this workspace')\n"
b = '      if (resolved.namedWorkspace) throw new NotFoundException(NOT_THERE)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-13-the-workspace-is-looked-up: a named workspace refuses a stranger with 404')
