# A TICK STARTS A ROOM PASS ON TOP OF ONE STILL RUNNING (`found-6-oct/an-open-socket-outlives-its-access`).
#
# One room pass at a time: a tick that comes while one runs has the next start
# as soon as it ends. Start one at every tick instead and a pass that outlasts
# the interval is asked again on top of itself. Also reddens the session-sweep
# test, which counts the room passes its ticks started.
#
# Reddens: unit: realtime.gateway.test.ts "one room pass at a time: a tick that comes while one runs starts the next as soon as it ends, not on top of it"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '    if (this.roomPass) this.roomPassDue = true\n    else this.startRoomPass()\n'
b = '    this.startRoomPass()\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-12-a-sweep-on-top-of-a-sweep-unit: a tick starts a room pass on top of one still running')
