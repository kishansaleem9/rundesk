# A DRAG MOVES A TIMED DATE BY 24 HOURS A DAY (`found-5-oct/timeline-press-moves-dates`), asked of `shiftByDays`:
# across a change of the clocks the time of day moves by the hour, where a picked day keeps it.
# Reddens: unit: task-dates.test.ts "moves a timed date by whole days and keeps its time of day, across a change of the clocks too"
import io
p = '/home/user/rundesk/apps/web/src/lib/task-dates.ts'
a = '  else at.setDate(at.getDate() + days)\n'
b = '  else at.setTime(at.getTime() + days * 86_400_000)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tpm-2-a-day-is-24-hours-unit: a timed date moves by 24 hours a day')
