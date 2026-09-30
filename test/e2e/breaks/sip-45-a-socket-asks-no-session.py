# A SOCKET'S HANDSHAKE CHECKS THE TOKEN'S SIGNATURE ALONE AGAIN (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# The realtime gateway no longer asks whether the token's session is live, so
# a session a password change has ended still opens a socket, and hears its
# rooms, for the minutes its access token has left.
#
# Reddens: sign-in-and-password:
#   "a session that has ended opens no realtime socket: its access token’s handshake is ended with \"Session ended\", while the live session’s socket stays up"
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
print('sip-45-a-socket-asks-no-session: a socket opens for any token that verifies')
