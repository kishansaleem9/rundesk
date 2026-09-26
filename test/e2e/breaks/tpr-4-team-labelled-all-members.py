# THE MONTHLY HEADER CALLS A TEAM ALL MEMBERS: the manager’s team is labelled as everyone.
# Reddens: time-page-reach: "the Time page’s Team view lists the manager’s team, not the far member, and the monthly header says it is their team’s — not all members’"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-time-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "timeReach === 'team' ? ` · ${t('time.yourTeam')}` : ''"
b = "timeReach === 'team' ? ` · ${t('time.allMembers')}` : ''"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tpr-4-team-labelled-all-members: team labelled all members')
