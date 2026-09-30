# A DAY BESIDE A MOMENT IS NEVER ORDERED WHERE ITS WRITER IS: the zone is not asked, so every write
# falls back to what every zone would see.
#
# Reddens: unit: task-values.test.ts "orders a day beside a moment as the day the moment falls on where its writer is, the same instant taken where it falls on the due day"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-values.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (zone && isValidTimeZone(zone)) {\n',
     '  if (false) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-20-a-moment-read-in-no-zone-unit: startsAfterDue asks no zone')
