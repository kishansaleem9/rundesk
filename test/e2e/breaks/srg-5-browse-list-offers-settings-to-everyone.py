# THE BROWSE LIST'S SETTINGS LINK IS OFFERED TO EVERYONE.
# Reddens: settings-role-grants: "Workspace settings is offered to a member only once a role grants a key one of its tabs serves — the plain member is offered it nowhere (avatar menu, palette, dock, browse list, switcher, rail) and is sent away from its address; the webhook holder is offered it everywhere, and lands in it"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                {settingsAccess.mayOpen && (\n                  <NavLink to="/app/$workspaceId/settings"'
b = '                {(settingsAccess.mayOpen || workspaceId !== \'\') && (\n                  <NavLink to="/app/$workspaceId/settings"'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-5-browse-list-offers-settings-to-everyone: the browse list offers Settings to everyone')
