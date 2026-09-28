# THE DOCK CARRIES SETTINGS FOR WHOEVER CHOSE IT, whether or not settings lets them in.
# Re-aimed 28 September: every member is offered Settings on Archived; the check reads what a plain member is offered and shown.
# Reddens: settings-role-grants: "Workspace settings is offered to every member, and a plain member lands on Archived alone (avatar menu, palette, dock, browse list, switcher, rail) — the one tab no key opens; the webhook holder is offered it everywhere too, and lands with Integrations beside it; a guest is offered it nowhere and is sent away from its address"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    (tool) => (!tool.flag || featureEnabled(tool.flag)) && (!tool.settings || settingsAccess.mayOpen),\n'
b = "    (tool) => (!tool.flag || featureEnabled(tool.flag)) && (!tool.settings || settingsAccess.mayOpen || workspaceId !== ''),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-4-dock-offers-settings-to-everyone: the dock offers Settings to everyone')
