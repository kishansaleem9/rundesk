# A TIMELINE HANDLE SAVES THE DAY WITHOUT ITS TIME (`found-5-oct/timeline-press-moves-dates`): the left handle
# writes the start as the day it lands on with no time, as the handles' `startOfDay` lost 09:00.
# Reddens: timeline-dates: "each handle moves its own date by whole days and keeps its time: a day’s drag of the left handle starts the task at 09:00 a day later, of the right one makes it due at 17:30 a day later, the other date untouched, in UTC, Los Angeles and Karachi (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx'
a = '    return { startDate: task.startDate ? shiftByDays(task.startDate, d) : dayAsDateOnly(daysAfter(from, d)) }\n'
b = '    return { startDate: dayAsDateOnly(daysAfter(from, d)) }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("timeline-dates-4-a-handle-saves-midnight: the left handle drops the start's time")
