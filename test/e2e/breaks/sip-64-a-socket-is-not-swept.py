# AN OPEN SOCKET IS NOT SWEPT WHEN ITS SESSION ENDS (`found-30-sep/an-open-socket-outlives-its-session`).
#
# The handshake reads the token's session once; a socket opened before its
# session was revoked stayed connected and heard its rooms for as long as its
# connection lasted (nothing ended it when its access token ran out either).
# The gateway re-reads each live socket's session on a short
# interval and disconnects a revoked one; this leaves the dead socket connected,
# so it goes on hearing its rooms after its session is signed out elsewhere.
#
# Reddens: sign-in-and-password:
#   "a socket open on a session that is then signed out elsewhere is disconnected within seconds with \"Session ended\" and hears no more of its rooms, while the session that signed it out keeps its socket"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "      if (data?.sid && ended.has(data.sid)) this.endSocket(client, 'Session ended')\n"
b = "      if (data?.sid && ended.has(data.sid)) void client\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-64-a-socket-is-not-swept: the sweep finds a revoked session but does not disconnect its sockets')
