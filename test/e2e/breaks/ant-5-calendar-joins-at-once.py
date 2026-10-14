# A CALENDAR'S MEETING IS JOINED AT ONCE, NOT WHEN IT BEGINS.
# (`commit-log/log-39863ff-1`)
#
# ClickUp's notetaker joins a calendar's meetings "when they begin". Sent with no
# time, the bot joins the moment the calendar is looked at — up to fifteen
# minutes early, into a room nobody is in yet.
#
# Reddens: ai-notetaker: "“Join all meetings for” a calendar sends a bot to its meeting with a link, to join at its start, and none to a meeting without one or to an all-day event"
import io
p = '/home/user/rundesk/apps/api/src/modules/notetaker/notetaker.service.ts'
a = "        await this.dispatch(cfg, row, startsAt.getTime() > now + 60_000 ? startsAt : null)"
b = "        await this.dispatch(cfg, row, null)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('notetaker.service.ts: a calendar meeting is joined at once.')
