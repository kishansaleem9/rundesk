# SETTING THE WORKSPACE DEFAULT ASKS A KEY EVERY MEMBER HOLDS: a manager and a plain member each make their own dashboard the default.
# Reddens: default-dashboard-access: "neither a manager nor a plain member makes their own dashboard the workspace default (403 each), and the admin’s stays it"
import io
p = '/home/user/rundesk/apps/api/src/modules/dashboards/dashboards.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('dashboard.workspace_default.manage')\n  setWorkspaceDefault("
b = "  @RequirePermissions('report.view.basic')\n  setWorkspaceDefault("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dda-2-setting-asks-a-members-key: setting asks report.view.basic')
