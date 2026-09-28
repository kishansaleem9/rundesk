# THE DASHBOARD OFFERS SET AND CLEAR TO EVERYBODY: the manager and the plain member are offered controls the API refuses them.
# Reddens: default-dashboard-access: "the dashboard offers the workspace admin “Clear workspace default”, and the manager and the plain member only the “Workspace default” badge — no set or clear control on the default or on their own"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.dashboard.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const canManageWorkspaceDefault = usePermissions(workspaceId).can('dashboard.workspace_default.manage') === true\n"
b = "  const canManageWorkspaceDefault: boolean = usePermissions(workspaceId).can('dashboard.workspace_default.manage') === true || true\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dda-9-page-offers-everyone: the page offers set and clear to everyone')
