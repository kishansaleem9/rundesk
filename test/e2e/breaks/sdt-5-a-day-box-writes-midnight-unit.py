# A DAY BOX WRITES THE DAY AT MIDNIGHT (`found-30-sep/sheet-dates-write-as-typed`, as the review found the Table
# cell doing it), asked of `dateBoxCommit` itself: what is typed is read as a date and time, not handed to the
# box's own rule (`withDatePart`), so a day picked for a task due at 16:00 is written as that day at 00:00.
# Reddens: unit: date-box.test.ts "writes a day box as the day picked, keeping the time the date carries"
import io
p = '/home/user/rundesk/apps/web/src/lib/date-box.ts'
a = '  const iso = toValue(draft)\n'
b = '  const iso = draft ? new Date(draft).toISOString() : toValue(draft)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sdt-5-a-day-box-writes-midnight-unit: a typed day is written at midnight')
