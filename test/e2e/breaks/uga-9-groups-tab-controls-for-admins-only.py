# THE GROUPS TAB OFFERS ITS CONTROLS BY THE ADMIN ROLE: the member granted groups.manage gets no new-group field.
# Reddens: user-group-access: "Settings opens its Groups tab to the member granted groups.manage, with the new-group field and the groups listed — and sends the manager, asking for it, to a tab of theirs with no Groups tab in the rail"
import io
p = '/home/user/rundesk/apps/web/src/components/groups-tab.tsx'
s = io.open(p, encoding='utf-8').read()
a = "import { usePermissions } from '../hooks/use-permissions'\n"
b = "import { usePermissions } from '../hooks/use-permissions'\nimport { useWorkspaceRole } from '../hooks/use-workspace-role'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = '  const mayManage = groupsKey === true\n'
b = '  const mayManage = useWorkspaceRole(workspaceId).isAdmin\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("uga-9-groups-tab-controls-for-admins-only: the tab's controls ask isAdmin")
