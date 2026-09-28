# CLEARING THE WORKSPACE DEFAULT ASKS AN ADMIN'S KEY, NOT ITS OWN: the member granted dashboard.workspace_default.manage sets it and cannot clear it (403).
# Reddens: default-dashboard-access: "a member granted dashboard.workspace_default.manage makes their own dashboard the workspace default, replacing the admin’s, and clears it"
import io
p = '/home/user/rundesk/apps/api/src/modules/dashboards/dashboards.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('dashboard.workspace_default.manage')\n  clearWorkspaceDefault("
b = "  @RequirePermissions('workspace.manage')\n  clearWorkspaceDefault("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dda-5-clearing-asks-the-admins-key: clearing asks workspace.manage')
