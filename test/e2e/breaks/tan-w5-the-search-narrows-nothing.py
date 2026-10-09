# A NAME SEARCHED NARROWS NOTHING.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "the arrows move the period — no further on than this week — and the week before shows the other member’s older view; a name searched leaves that person alone"
import io
p = '/home/user/rundesk/apps/web/src/components/teams-analytics.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const people = data.people.filter((p) => `${p.displayName} ${p.email}`.toLowerCase().includes(needle))\n',
     '  const people = data.people // BROKEN: the search narrows nothing\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-w5-the-search-narrows-nothing: the search narrows nothing')
