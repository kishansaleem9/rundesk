# THE SESSIONS ARE ASKED ABOUT ONLY WHEN NO ROOM PASS IS RUNNING (`found-6-oct/an-open-socket-outlives-its-access`).
#
# Each tick asks about the sessions whatever the rooms cost. Skip the sessions
# while a room pass runs and a revoked session's socket waits behind the rooms:
# measured in review, 9.7 s with one socket holding 3,000 task rooms, where it
# had closed in 3.9 s.
#
# Reddens: unit: realtime.gateway.test.ts "the session sweep runs at every tick while a room pass is still running: a revoked session’s socket does not wait behind the rooms"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '    if (!this.sessionSweep) {\n'
b = '    if (!this.sessionSweep && !this.roomPass) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-17-the-sessions-wait-behind-the-rooms-unit: the sessions wait behind a room pass')
