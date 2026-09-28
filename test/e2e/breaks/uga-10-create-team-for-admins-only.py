# THE TEAMS PAGE OFFERS CREATE TEAM BY THE ADMIN ROLE: the member granted groups.manage gets it disabled.
# Reddens: user-group-access: "the Teams page offers the member granted groups.manage an enabled Create Team, and the team they name through it is made"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "import { usePermissions } from '../hooks/use-permissions'\n"
b = "import { usePermissions } from '../hooks/use-permissions'\nimport { useWorkspaceRole } from '../hooks/use-workspace-role'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = '  const mayCreateTeam = createTeamKey === true\n'
b = '  const mayCreateTeam = useWorkspaceRole(workspaceId).isAdmin\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uga-10-create-team-for-admins-only: Create Team asks isAdmin')
