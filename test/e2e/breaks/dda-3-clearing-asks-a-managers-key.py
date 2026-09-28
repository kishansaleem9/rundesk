# CLEARING THE WORKSPACE DEFAULT ADMITS MANAGERS, AS WORKSPACEADMINGUARD DID: a manager clears the admin's default.
# Reddens: default-dashboard-access: "a manager clears no workspace default an admin set (403), no more than a plain member does — it is still the admin’s dashboard"
#   or "a member granted dashboard.workspace_default.manage makes their own dashboard the workspace default, replacing the admin’s, and clears it"
import io
p = '/home/user/rundesk/apps/api/src/modules/dashboards/dashboards.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('dashboard.workspace_default.manage')\n  clearWorkspaceDefault("
b = "  @RequirePermissions('members.profile.manage')\n  clearWorkspaceDefault("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("dda-3-clearing-asks-a-managers-key: clearing asks members.profile.manage, a manager's key")
