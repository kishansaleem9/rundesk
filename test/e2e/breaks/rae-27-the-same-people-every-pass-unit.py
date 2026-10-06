# EVERY ROOM PASS TAKES THE SAME PEOPLE FIRST (`found-6-oct/an-open-socket-outlives-its-access`).
#
# Each pass takes the person who has waited longest first. Take them in the
# same order every pass instead, and when there are more people than a pass
# can reach in a round, the ones at the end are never asked: their rooms are
# kept whatever happens to their access.
#
# Reddens: unit: realtime.gateway.test.ts "a person the last pass did not reach is asked first in the next, however many people there are"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '      .sort((a, b) => lastAsked(a[0]) - lastAsked(b[0]))\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-27-the-same-people-every-pass-unit: every room pass takes the same people first')
