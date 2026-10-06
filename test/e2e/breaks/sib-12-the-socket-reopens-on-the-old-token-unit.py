# THE SOCKET OPENS AGAIN ON THE TOKEN THE TAB HELD (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# The token a tab holds, if any, is the ended session's; the browser's session
# is its cookie, which the handshake reads when no token is given. Keep the
# old token on the socket and it opens again on the ended session, which the
# server refuses. Also reddens the other tests that open it again: after
# somebody else, and after the server closed it.
#
# Reddens: unit: realtime.test.ts "another tab’s sign-in as this tab’s person closes this tab’s socket and opens it again on the browser’s session, not on the token this tab holds"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '  sock.auth = {}\n  sock.connect()\n}\n'
b = '  sock.connect()\n}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-12-the-socket-reopens-on-the-old-token-unit: the socket opens again on the token the tab held')
