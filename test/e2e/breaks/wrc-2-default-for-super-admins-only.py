# THE DASHBOARD'S DEFAULT IS A SUPER-ADMIN'S ONLY, as the empty store left it.
# Reddens: workspace-role-controls: "the dashboard offers a workspace admin who is not a super-admin “Set as workspace default”, and a member none"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.dashboard.tsx'
a = "  const canManageWorkspaceDefault = usePermissions(workspaceId).can('dashboard.workspace_default.manage') === true\n"
b = "  const canManageWorkspaceDefault = user?.role === 'super_admin'\n  void usePermissions\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wrc-2-default-for-super-admins-only: applied")
