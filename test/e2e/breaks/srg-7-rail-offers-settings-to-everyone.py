# THE COLLAPSED RAIL OFFERS SETTINGS TO EVERYONE.
# Re-aimed 28 September: every member is offered Settings on Archived; the check reads what a plain member is offered and shown.
# Reddens: settings-role-grants: "Workspace settings is offered to every member, and a plain member lands on Archived, with only Trash and Features beside it (avatar menu, palette, dock, browse list, switcher, rail) — the tabs no key opens; the webhook holder is offered it everywhere too, and lands with Integrations beside it; a guest is offered it nowhere and is sent away from its address"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = 'railEntries(workspaceId, featureEnabled, settingsAccess.mayOpen, '
b = "railEntries(workspaceId, featureEnabled, settingsAccess.mayOpen || workspaceId !== '', "
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-7-rail-offers-settings-to-everyone: the rail offers Settings to everyone')
