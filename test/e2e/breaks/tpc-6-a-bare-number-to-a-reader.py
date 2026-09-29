# THE COUNT IS A BARE NUMBER TO A SCREEN READER: "4", with nothing to say four of what.
# Reddens: teams-people-count: "a fourth person joining moves it to 4 on the next load, and it says what it counts: “4 people in this workspace”"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
a = "                aria-label={tCount('teams.peopleCount', members.length)}\n"
b = "                aria-label={String(members.length)}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tpc-6-a-bare-number-to-a-reader: the count names nothing')
