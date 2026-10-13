# A SCHEDULE OWES WHAT IT WAS SET AFTER: the time it was switched on is not read, so a
# daily schedule switched on at three o'clock runs at once for nine o'clock that morning.
# Reddens: unit: schedule.test.ts "a schedule set after today’s time waits for tomorrow’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/schedule.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (Number.isFinite(since) && slot < since) return false\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('sa-u1-a-schedule-owes-the-morning-it-missed: the time a schedule was set is not read')
