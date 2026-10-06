# A SWEEP READS A ROOM'S WORKSPACE AND A MEMBERSHIP AGAIN FOR EVERY QUESTION (`found-6-oct/an-open-socket-outlives-its-access`).
#
# Within one sweep a room's workspace and a person's membership of it are read
# once, however many questions ask. Ignore the sweep's shared reads and each
# question reads them again.
#
# Reddens: unit: realtime.gateway.test.ts "within one sweep a room’s workspace is read once, and a person’s membership of it once, however many of their rooms ask; a subscribe reads afresh"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "  if (!reads) return read()\n"
b = "  if (reads || !reads) return read()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-11-each-question-reads-afresh-unit: each room question reads afresh within a sweep')
