# A SPACE'S OWN "+" OFFERS EVERY TYPE AGAIN, whatever the person may make.
# Reddens: role-permissions-web: "a member is offered Space and not Project, in the Create menu and on a space’s own menu, and Reports"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = '    () => SPACE_CREATE_TYPES.filter((type) => !type.requires || (permissions.loaded && permissions.granted.has(type.requires))),\n'
b = '    () => SPACE_CREATE_TYPES,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rpw-3-space-menu-ignores-permissions: the space menu ignores permissions')
