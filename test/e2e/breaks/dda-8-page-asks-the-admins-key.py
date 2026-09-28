# THE DASHBOARD OFFERS SET AND CLEAR BY AN ADMIN'S KEY, NOT ITS OWN: the member granted dashboard.workspace_default.manage is offered neither.
# Reddens: default-dashboard-access: "the dashboard offers the member granted dashboard.workspace_default.manage “Clear workspace default” on the admin’s default and “Set as workspace default” on their own"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.dashboard.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const canManageWorkspaceDefault = usePermissions(workspaceId).can('dashboard.workspace_default.manage') === true\n"
b = "  const canManageWorkspaceDefault = usePermissions(workspaceId).can('workspace.manage') === true\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dda-8-page-asks-the-admins-key: the page offers set and clear by workspace.manage')
