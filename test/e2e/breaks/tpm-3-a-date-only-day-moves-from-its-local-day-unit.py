# A DRAG MOVES A DATE-ONLY DAY FROM THE LOCAL DAY OF ITS UTC MIDNIGHT (`found-5-oct/timeline-press-moves-dates`), as
# the Gantt's `addDays(new Date(iso))` did: west of UTC the 12th moved a day is the 12th again.
# Re-aimed 8 October: the dates carry their time flag (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
# Reddens: unit: task-dates.test.ts "moves a date-only day to the next day, still date-only, in every zone"
import io
p = '/home/user/rundesk/apps/web/src/lib/task-dates.ts'
a = '  if (isDateOnly(at, hasTime)) at.setUTCDate(at.getUTCDate() + days)\n'
b = '  if (isDateOnly(at, hasTime)) return utcMidnight(at.getFullYear(), at.getMonth(), at.getDate() + days).toISOString()\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tpm-3-a-date-only-day-moves-from-its-local-day-unit: a date-only day moves from the instant's local day")
