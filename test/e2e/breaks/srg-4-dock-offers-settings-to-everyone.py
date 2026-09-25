# THE DOCK CARRIES SETTINGS FOR WHOEVER CHOSE IT, whether or not settings lets them in.
# Reddens: settings-role-grants: "Workspace settings is offered to a member only once a role grants a key one of its tabs serves — the plain member is offered it nowhere (avatar menu, palette, dock, browse list, switcher, rail) and is sent away from its address; the webhook holder is offered it everywhere, and lands in it"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    (tool) => (!tool.flag || featureEnabled(tool.flag)) && (!tool.settings || settingsAccess.mayOpen),\n'
b = "    (tool) => (!tool.flag || featureEnabled(tool.flag)) && (!tool.settings || settingsAccess.mayOpen || workspaceId !== ''),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-4-dock-offers-settings-to-everyone: the dock offers Settings to everyone')
