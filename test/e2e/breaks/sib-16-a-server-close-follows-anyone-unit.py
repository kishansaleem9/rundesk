# A SOCKET THE SERVER CLOSED OPENS AGAIN ON WHOEVER THE BROWSER IS SIGNED IN AS (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# A tab opens its socket again only on a session that is still its own
# person's. Drop that and a tab still showing one person opens a socket as
# whoever signed in since in another tab, which is the owner's to decide.
#
# Reddens: unit: realtime.test.ts "a socket closed by the tab itself, or while the browser’s session is nobody or somebody else, or already open again, stays as it is"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '  if (!signedIn || signedIn !== here() || sock.active || sock.connected) return false\n'
b = '  if (!signedIn || sock.active || sock.connected) return false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-16-a-server-close-follows-anyone-unit: a socket the server closed opens again as anyone')
