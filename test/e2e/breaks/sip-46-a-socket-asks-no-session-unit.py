# A SOCKET'S HANDSHAKE CHECKS THE TOKEN'S SIGNATURE ALONE AGAIN, READ FROM THE GATEWAY (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# `sip-45`'s edit, claimed by the unit test: an ended session's socket joins
# its person's room.
#
# Reddens: unit: realtime.gateway.test.ts "a socket whose token’s session has ended is ended at its handshake with “Session ended”, and joins no room; a live session’s joins its own"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = (
    "      if (!(await sessionIsLive(this.db, payload))) {\n"
    "        client.emit('error', { message: 'Session ended' })\n"
    "        client.disconnect(true)\n"
    "        return\n"
    "      }\n"
)
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-46-a-socket-asks-no-session-unit: a socket opens for any token that verifies')
