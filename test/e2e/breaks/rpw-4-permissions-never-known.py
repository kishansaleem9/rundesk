# THE PERMISSIONS NEVER ARRIVE: nothing a permission gates is ever offered, not
# even what the role holds or a custom role grants.
# Reddens: role-permissions-web: "once a custom role grants project.create, the member is offered Project in both menus"
#   or "a member is offered Space and not Project, in the Create menu and on a space’s own menu, and Reports"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-permissions.ts'
a = '  const loaded = query.data !== undefined\n'
b = '  const loaded = false as boolean\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rpw-4-permissions-never-known: the permissions never load')
