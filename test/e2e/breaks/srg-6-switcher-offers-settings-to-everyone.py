# THE WORKSPACE SWITCHER'S SETTINGS SHORTCUT IS OFFERED TO EVERYONE.
# Re-aimed 28 September: every member is offered Settings on Archived; the check reads what a plain member is offered and shown.
# Reddens: settings-role-grants: "Workspace settings is offered to every member, and a plain member lands on Archived, with only Trash and Features beside it (avatar menu, palette, dock, browse list, switcher, rail) — the tabs no key opens; the webhook holder is offered it everywhere too, and lands with Integrations beside it; a guest is offered it nowhere and is sent away from its address"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        {workspaceId && settingsAccess.mayOpen && (\n          <div className="mt-2 flex gap-2">'
b = '        {workspaceId && (settingsAccess.mayOpen || workspaceId !== \'\') && (\n          <div className="mt-2 flex gap-2">'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-6-switcher-offers-settings-to-everyone: the switcher offers Settings to everyone')
