# A ROOM PASS ASKS UNTIL IT HAS ASKED EVERYTHING (`found-6-oct/an-open-socket-outlives-its-access`).
#
# A pass stops asking when the interval is up, and the next goes on from the
# rooms not reached. Ask everything every pass instead and a pass lasts as
# long as the most rooms anyone holds make it. Also reddens the test of the
# people a pass did not reach, which a pass without end reaches every time.
#
# Reddens: unit: realtime.gateway.test.ts "a pass stops asking once the interval is up, and the next pass asks first the rooms the last did not reach"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '      while (next < queue.length && Date.now() < until) {\n'
b = '      while (next < queue.length) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-20-a-pass-without-end-unit: a room pass asks until it has asked everything')
