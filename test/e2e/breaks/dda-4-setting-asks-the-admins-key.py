# SETTING THE WORKSPACE DEFAULT ASKS AN ADMIN'S KEY, NOT ITS OWN: the member granted dashboard.workspace_default.manage is refused (403).
# Reddens: default-dashboard-access: "a member granted dashboard.workspace_default.manage makes their own dashboard the workspace default, replacing the admin’s, and clears it"
#   or "even granted the key, a member cannot make a colleague’s unshared dashboard the workspace default — it is not found for them (404), and the default does not move"
import io
p = '/home/user/rundesk/apps/api/src/modules/dashboards/dashboards.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('dashboard.workspace_default.manage')\n  setWorkspaceDefault("
b = "  @RequirePermissions('workspace.manage')\n  setWorkspaceDefault("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dda-4-setting-asks-the-admins-key: setting asks workspace.manage')
