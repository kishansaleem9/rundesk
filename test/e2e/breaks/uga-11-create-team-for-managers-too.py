# THE TEAMS PAGE ALSO OFFERS CREATE TEAM TO MANAGERS, AS IT DID: a manager gets an enabled button the API refuses.
# Reddens: user-group-access: "the Teams page lists the teams to the manager and to a plain member, but offers neither of them Create Team — it is disabled and says why"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "import { usePermissions } from '../hooks/use-permissions'\n"
b = "import { usePermissions } from '../hooks/use-permissions'\nimport { useWorkspaceRole } from '../hooks/use-workspace-role'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = '  const mayCreateTeam = createTeamKey === true\n'
b = '  const mayCreateTeam = useWorkspaceRole(workspaceId).isManagerOrAbove || createTeamKey === true\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uga-11-create-team-for-managers-too: Create Team asks the key or isManagerOrAbove')
