# THE AUDIT LOG ASKS A KEY EVERY MEMBER HOLDS: a manager reads and exports it.
# Reddens: admin-only-keys: "a manager neither reads nor exports the audit log (403 each) — a member granted workspace.audit.view reads it, and the admin does"
import io
p = '/home/user/rundesk/apps/api/src/modules/security/security.controller.ts'
a = "@RequirePermissions('workspace.audit.view')\n"
b = "@RequirePermissions('report.view.basic')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('aok-2-audit-log-asks-a-members-key: the audit log asks report.view.basic')
