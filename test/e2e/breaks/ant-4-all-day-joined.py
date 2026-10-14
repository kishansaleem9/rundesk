# AN ALL-DAY EVENT IS SENT A BOT.
# (`commit-log/log-39863ff-1`)
#
# A calendar's all-day event — an offsite, a holiday — with a meeting link in it
# is treated as a meeting beginning at midnight, and a bot is sent to sit in it.
#
# Reddens: ai-notetaker: "“Join all meetings for” a calendar sends a bot to its meeting with a link, to join at its start, and none to a meeting without one or to an all-day event"
import io
p = '/home/user/rundesk/apps/api/src/modules/notetaker/notetaker.service.ts'
a = "        if (e.allDay || !e.meetingUrl) continue\n"
b = "        if (!e.meetingUrl) continue\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
# Its day reads as a start within the window, as a midnight would on the day.
a2 = "        if (!platform || startsAt.getTime() < now - LOOK_BEHIND_MS || startsAt.getTime() > now + LOOK_AHEAD_MS) continue\n"
b2 = "        if (!platform || (!e.allDay && (startsAt.getTime() < now - LOOK_BEHIND_MS || startsAt.getTime() > now + LOOK_AHEAD_MS))) continue\n"
assert s.count(a2) == 1, f'anchor appears {s.count(a2)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a2, b2))
print('notetaker.service.ts: all-day events are joined too.')
