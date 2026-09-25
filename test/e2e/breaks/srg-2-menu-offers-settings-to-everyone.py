# THE AVATAR MENU OFFERS WORKSPACE SETTINGS TO EVERYONE AGAIN, and the route sends
# a plain member straight back.
# Reddens: settings-role-grants: "Workspace settings is offered to a member only once a role grants a key one of its tabs serves — the plain member is offered it nowhere (avatar menu, palette, dock, browse list, switcher, rail) and is sent away from its address; the webhook holder is offered it everywhere, and lands in it"
import io
p = '/home/user/rundesk/apps/web/src/components/app-topbar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        {workspaceId && settingsAccess.mayOpen && (\n'
b = "        {workspaceId && (settingsAccess.mayOpen || workspaceId !== '') && (\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-2-menu-offers-settings-to-everyone: the avatar menu offers Settings to everyone')
