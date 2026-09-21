# The 'Show time left' switch keeps saving and the countdown keeps being drawn. The
# settings page still has three switches and still looks complete.
#
# REDDENS: planner-upcoming-meeting.mjs — "the countdowns are gone, and both meetings are still listed"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const showTimeLeft = prefs?.upcomingShowTimeLeft !== false'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = '  const showTimeLeft = true // BREAK: the switch saves and the badge stays'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('reverted the upcomingShowTimeLeft reader on the Meetings page')
