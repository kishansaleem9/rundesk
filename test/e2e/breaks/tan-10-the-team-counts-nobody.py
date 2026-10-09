# A TEAM ROLLS UP NOBODY: its members are never counted.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "and the team rolls its two members up: their number, their activity and their task views summed"
import io
p = '/home/user/rundesk/apps/api/src/modules/team-analytics/team-analytics.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        team.members += 1\n',
     '        // BROKEN: the team counts nobody\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-10-the-team-counts-nobody: the team counts nobody')
