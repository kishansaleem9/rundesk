# Same again for quick join: the switch stores `false` and the Join pill is drawn anyway.
#
# Reddens: planner-upcoming-meeting: "the Join pills are gone too, and the rows survived that as well"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const quickJoin = prefs?.upcomingQuickJoin !== false'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = '  const quickJoin = true // BREAK: the switch saves and the Join pill stays'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('reverted the upcomingQuickJoin reader on the Meetings page')
