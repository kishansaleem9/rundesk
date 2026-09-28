# CAPACITY AND REPORTS-TO ARE OFFERED TO A MANAGER'S ROLE AND UP, AS THEY WERE: the member granted members.profile.manage sees neither.
# Reddens: people-calendar-access: "Settings opens Members to the member granted members.profile.manage with every person’s capacity and reports-to to set — as it does for the manager"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const mayProfile = perms.can('members.profile.manage') === true\n"
b = "  const mayProfile = isSuperAdmin || workspaceRole === 'manager' || workspaceRole === 'workspace_admin'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pca-10-profile-controls-by-role: the Members tab offers capacity and reports-to by role')
