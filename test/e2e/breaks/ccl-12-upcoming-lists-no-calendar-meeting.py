# UPCOMING LISTS RUNDESK'S MEETINGS ALONE, as before (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: connected-calendars:
#   "Meetings’ “Upcoming” lists the next meeting in a connected calendar, with whose calendar it is, and names the one it could not read"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
a = '      .filter((e) => !e.allDay && Date.parse(e.start) >= Date.now())\n'
b = '      .filter((e) => false && !e.allDay && Date.parse(e.start) >= Date.now())\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ccl-12-upcoming-lists-no-calendar-meeting: upcoming lists rundesk's meetings alone, as before (`found-25-sep/connected-calendars-read-by-nothing`)")
