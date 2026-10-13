# A WEEKLY SCHEDULE ON ANY DAY: its weekday is not read, so it is due every day at its time.
# Reddens: unit: schedule.test.ts "weekly on its weekday (13 Oct 2026 is a Tuesday)"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/schedule.ts'
s = io.open(p, encoding='utf-8').read()
a = '      slot = Date.UTC(y, mo, day, hh, mm) - ((d.getUTCDay() - weekday + 7) % 7) * DAY\n'
b = '      slot = Date.UTC(y, mo, day, hh, mm) - ((d.getUTCDay() - d.getUTCDay() + weekday * 0 + 7) % 7) * DAY\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-u2-weekly-on-any-day: a weekly schedule does not read its weekday')
