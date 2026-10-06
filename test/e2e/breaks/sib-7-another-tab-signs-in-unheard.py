# ANOTHER TAB’S SIGN-IN LEAVES THIS TAB’S SOCKET CLOSED (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# The tabs of a browser share one session; when the person signs out and back
# in from one tab, the server ends every tab's socket on the old session and
# only the signing-in tab hears of the new one. The other tabs hear the
# store's write and open their socket again on the browser's session. Drop
# that and the other tab, whose socket the server closed before the sign-in,
# hears nothing until it is reloaded.
#
# Reddens: session-in-the-browser:
#   "when the person signs out and back in from one tab, another tab of the same browser opens its realtime socket again on the new session without a reload: a message in their own private channel is heard there, and the list it shows draws a task made after, as before"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '  sock.disconnect()\n  reopenOnTheBrowsersSession(sock)\n}\n'
b = '  void sock\n}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-7-another-tab-signs-in-unheard: another tab’s sign-in no longer opens this tab’s socket')
