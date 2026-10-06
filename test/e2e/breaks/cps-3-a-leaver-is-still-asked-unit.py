# AN OWNER WHO HAS LEFT THE WORKSPACE IS TAKEN FOR ONE WHO MAY READ.
# Reddens: unit: calendar-sync.service.test.ts "is no for somebody no longer in the workspace — a platform admin too"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
a = '    if (!member) return false\n'
b = '    if (!member) return true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cps-3-a-leaver-is-still-asked-unit: a removed owner still reads')
