# A SPACE'S OWN "+" OFFERS EVERY TYPE AGAIN, whatever the person may make.
# RE-AIMED 24 September: each create type now declares what a guest may do with it
# (`guests`), and both menus ask one hook (`useCreatable`); the mistake is the same.
# Reddens: role-permissions-web: "a member is offered Space and not Project, in the Create menu and on a space’s own menu, and Reports"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = '  const typesForSpace = (spaceId: string) => SPACE_CREATE_TYPES.filter((type) => creatable(type, spaceId))\n'
b = "  const typesForSpace = (spaceId: string) => SPACE_CREATE_TYPES.filter(() => spaceId !== '')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rpw-3-space-menu-ignores-permissions: the space menu ignores permissions')
