# THE SOCKET OPENS AGAIN ON THE TOKEN THE TAB HELD, IN A BROWSER (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# `sib-12`'s edit, claimed by the two-tab check: the listening tab is the one
# the person signed in from, so it holds the ended session's token, and
# opened again on it the socket is refused, and refused again however often
# it is reopened. Also reddens the sign-in-again check, whose tab holds one too.
#
# Reddens: session-in-the-browser:
#   "when the person signs out and back in from one tab, another tab of the same browser opens its realtime socket again on the new session without a reload: a message in their own private channel is heard there, and the list it shows draws a task made after, as before"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '  sock.auth = {}\n  sock.connect()\n}\n'
b = '  sock.connect()\n}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-13-the-socket-reopens-on-the-old-token: the socket opens again on the token the tab held')
