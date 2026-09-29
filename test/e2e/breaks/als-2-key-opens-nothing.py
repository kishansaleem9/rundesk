# WORKSPACE.AUDIT.VIEW OPENS NO TAB: only an admin is offered the trail.
# Reddens: audit-log-settings: "a member granted workspace.audit.view by a custom role is offered the Audit log tab and reads the workspace’s events"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  auditLog: ['workspace.audit.view'],\n"
b = '  auditLog: [],\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('als-2-key-opens-nothing: the key opens no tab')
