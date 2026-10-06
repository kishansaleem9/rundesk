# A DAY WITH NO TIME IS STORED AS ITS LOCAL MIDNIGHT (`found-5-oct/timeline-press-moves-dates`), asked of
# `dayAsDateOnly`: a start added by a handle carries an offset, and reads as another day elsewhere.
# Reddens: unit: task-dates.test.ts "stores a day with no time as the date-only form, whatever the zone"
import io
p = '/home/user/rundesk/apps/web/src/lib/task-dates.ts'
a = '  return utcMidnight(day.getFullYear(), day.getMonth(), day.getDate()).toISOString()\n'
b = '  return new Date(day.getTime()).toISOString()\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tpm-4-a-new-date-is-local-midnight-unit: a day with no time is stored as local midnight')
