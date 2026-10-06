# A PRESENCE PING DOES NOT RE-READ THE SESSION (`found-30-sep/an-open-socket-outlives-its-session`).
#
# A ping re-reads the socket's session and disconnects a revoked one, between
# the interval sweeps. Drop that re-read and a ping on a revoked session's
# socket records a heartbeat as if the session were live, leaving the socket up.
#
# Reddens: unit: realtime.gateway.test.ts "a presence ping on a revoked session’s socket disconnects it instead of recording a heartbeat"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = (
    "    if (data.sid && !(await sessionIsLive(this.db, { sub: data.userId, sid: data.sid }))) {\n"
    "      this.endSocket(client, 'Session ended')\n"
    "      return\n"
    "    }\n"
)
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-66-a-ping-does-not-recheck-unit: a ping no longer re-reads the session')
