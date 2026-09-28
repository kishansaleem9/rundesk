# THE TEAMS PAGE’S CREATE TEAM IS DISABLED WITH NO REASON: a refused person gets a dead button.
# Reddens: user-group-access: "the Teams page lists the teams to the manager and to a plain member, but offers neither of them Create Team — it is disabled and says why"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                  data-testid="teams-create-open"\n                  disabled={!mayCreateTeam}\n                  data-disabled-reason={createTeamRefusal ? \'needs-groups-manage\' : undefined}\n                  title={createTeamRefusal}\n'
b = '                  data-testid="teams-create-open"\n                  disabled={!mayCreateTeam}\n                  data-disabled-reason={createTeamRefusal ? \'needs-groups-manage\' : undefined}\n                  title={undefined}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uga-12-create-team-says-no-reason: teams-create-open has no title')
