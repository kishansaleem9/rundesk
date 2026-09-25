# THE PALETTE OFFERS SETTINGS TO EVERYONE AGAIN.
# Reddens: settings-role-grants: "Workspace settings is offered to a member only once a role grants a key one of its tabs serves — the plain member is offered it nowhere (avatar menu, palette, dock, browse list, switcher, rail) and is sent away from its address; the webhook holder is offered it everywhere, and lands in it"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
s = io.open(p, encoding='utf-8').read()
a = "        ...(settingsAccess.mayOpen ? [{ icon: Settings, label: t('nav.settings'), to: `/app/${workspaceId}/settings` }] : []),\n"
b = "        ...(settingsAccess.mayOpen || workspaceId !== '' ? [{ icon: Settings, label: t('nav.settings'), to: `/app/${workspaceId}/settings` }] : []),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-3-palette-offers-settings-to-everyone: the palette offers Settings to everyone')
