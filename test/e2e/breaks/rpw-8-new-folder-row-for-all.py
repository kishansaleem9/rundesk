# THE SPACE'S OWN "NEW FOLDER" ROW IS DRAWN FOR A GUEST AGAIN, while both menus
# still leave Folder out: the one control of the three that is not a menu item.
# Reddens: role-permissions-web: "a guest who can see the space is offered no Folder — not in the Create menu, the space’s menu, or its New folder row — which the API refuses them, and a member is offered all three"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "                    {permissions.can('space.create') === true && (\n"
b = "                    {permissions.can('space.create') !== undefined && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rpw-8-new-folder-row-for-all: the New folder row is drawn for everybody')
