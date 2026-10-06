# A SOCKET THE SERVER CLOSED IS NOT OPENED AGAIN, READ FROM THE TAB (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# The browser's session is asked who it is, and answers this tab's person, and
# the socket is still not opened again.
#
# Reddens: unit: realtime.test.ts "a socket the server closed is opened again on the browser’s session when that session is still this tab’s person"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '  lastFollowedAt = now()\n  reopenOnTheBrowsersSession(sock)\n  return true\n'
b = '  lastFollowedAt = now()\n  return true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-15-a-server-close-reopens-nothing-unit: a socket the server closed is never opened again')
