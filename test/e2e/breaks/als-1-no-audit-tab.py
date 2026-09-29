# SETTINGS DRAWS NO AUDIT LOG TAB AGAIN: the trail is the console's alone.
# Reddens: audit-log-settings: "a workspace admin who is no platform admin reads the workspace’s audit log in its own Settings — its events, and none of another workspace’s"
#   or "a member granted workspace.audit.view by a custom role is offered the Audit log tab and reads the workspace’s events"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "      { id: 'auditLog', labelKey: 'settings.tabAuditLog', icon: ScrollText },\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('als-1-no-audit-tab: no Audit log tab')
