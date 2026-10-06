# AN OPEN SOCKET IS NOT SWEPT WHEN ITS SESSION ENDS, READ FROM THE GATEWAY (`found-30-sep/an-open-socket-outlives-its-session`).
#
# `sip-64`'s edit, claimed by the unit test: the sweep finds a revoked session's
# socket but leaves it connected.
#
# Reddens: unit: realtime.gateway.test.ts "the sweep disconnects a revoked session’s sockets with “Session ended” and leaves a live session’s untouched"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "      if (data?.sid && ended.has(data.sid)) this.endSocket(client, 'Session ended')\n"
b = "      if (data?.sid && ended.has(data.sid)) void client\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-65-a-socket-is-not-swept-unit: the sweep leaves a revoked session’s socket connected')
