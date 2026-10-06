# ANOTHER TAB’S SIGN-IN LEAVES THIS TAB’S SOCKET CLOSED, READ FROM THE TAB (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# `sib-7`'s edit, claimed by the unit test: the storage write of another tab's
# sign-in is heard and nothing is done. Also reddens the test of a sign-in
# after somebody else's, which takes the same path.
#
# Reddens: unit: realtime.test.ts "another tab’s sign-in as this tab’s person closes this tab’s socket and opens it again on the browser’s session, not on the token this tab holds"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '  sock.disconnect()\n  reopenOnTheBrowsersSession(sock)\n}\n'
b = '  void sock\n}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-8-another-tab-signs-in-unheard-unit: another tab’s sign-in no longer opens this tab’s socket')
