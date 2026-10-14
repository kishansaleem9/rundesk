# A CALENDAR'S MEETING IS SENT A BOT AT EVERY LOOK.
# (`commit-log/log-39863ff-1`)
#
# The visit is not tied to its event, so nothing says the meeting was already
# sent a bot: every look at the calendar sends another — and one called back is
# sent again a moment later.
#
# Reddens: ai-notetaker: "a scheduled visit is called back — unscheduled at the service — and is not sent again"
import io
p = '/home/user/rundesk/apps/api/src/modules/notetaker/notetaker.service.ts'
a = "            calendarEventId: e.id,\n"
b = "            calendarEventId: null,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('notetaker.service.ts: a calendar visit is not tied to its event.')
