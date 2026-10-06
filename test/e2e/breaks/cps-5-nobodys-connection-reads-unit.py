# A CONNECTION NOBODY OWNS ANY MORE TAKES EVERY TASK.
# Reddens: unit: calendar-sync.service.test.ts "is no for a connection nobody owns any more"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
a = '    if (!ownerId) return false\n'
b = '    if (!ownerId) return true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cps-5-nobodys-connection-reads-unit: nobody’s connection reads everything')
