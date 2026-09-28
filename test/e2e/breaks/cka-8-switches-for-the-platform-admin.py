# SETTINGS' CLICKAPP SWITCHES ARE THE PLATFORM ADMIN'S ALONE, AS THE CONSOLE'S ARE: a workspace admin is shown every switch dead.
# Reddens: clickapp-flags-access: "Settings offers the admin every ClickApp switch live — and shows the manager and a plain member the same list with every switch disabled and the reason said"
#   or "Settings opens Features to the member granted workspace.clickapps.manage, every ClickApp switch live and no “admins only” notice"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const mayManage = isAdmin || held === true\n'
b = '  const mayManage = useWorkspaceRole(workspaceId).isSuperAdmin\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cka-8-switches-for-the-platform-admin: the Features switches ask isSuperAdmin')
