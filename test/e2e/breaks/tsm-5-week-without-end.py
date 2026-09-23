# A WEEK WITH NO FAR END, AND NO DAY FILTER BEHIND IT: stepping back a week
# still brings every later entry with it.
# Reddens: timesheet-mine: "last week holds the thirty minutes logged then — not this week’s hour as well"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-time-page.tsx'
a = '&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`'
b = '&since=${encodeURIComponent(since)}`'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/web/src/pages/workspace-time-page.tsx'
a = "        (e) => e.userId === currentUserId && weekDayKeys.has(format(new Date(e.loggedAt), 'yyyy-MM-dd')),"
b = '        (e) => e.userId === currentUserId,'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsm-5-week-without-end: applied")
