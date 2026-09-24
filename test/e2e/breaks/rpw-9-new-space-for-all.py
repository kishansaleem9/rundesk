# THE SIDEBAR'S "NEW SPACE" IS DRAWN FOR A GUEST AGAIN, while the Create menu
# still leaves Space out: a 403 from the one button that is not a menu item.
# Reddens: role-permissions-web: "a guest is offered neither Space nor Project, nor Reports"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "            {permissions.can('space.create') === true && (\n              <button\n"
b = "            {permissions.can('space.create') !== undefined && (\n              <button\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rpw-9-new-space-for-all: New space is drawn for everybody')
