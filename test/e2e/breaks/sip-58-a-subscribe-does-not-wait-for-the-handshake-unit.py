# A SUBSCRIBE DOES NOT WAIT FOR THE HANDSHAKE (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# The handshake reads the token's session before it says who the socket is,
# and a subscribe that arrives first (the web subscribes the moment it
# connects) is judged with nobody signed in: every room is denied. Measured on
# lane 3 before the subscribe waited: `chat-realtime-access`,
# `call-realtime-access`, `guest-chat-scope` and `guest-canvas-scope` failed
# on it.
#
# Reddens: unit: realtime.gateway.test.ts "a subscribe that arrives before the handshake has found the session live waits for it: a live session’s socket joins its room, an ended one’s joins none"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "    await (client.data as { handshake?: Promise<void> })?.handshake\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-58-a-subscribe-does-not-wait-for-the-handshake-unit: a subscribe is judged before the handshake is done')
