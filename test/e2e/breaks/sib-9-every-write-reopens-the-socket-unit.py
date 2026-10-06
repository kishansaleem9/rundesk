# EVERY WRITE BY ANOTHER TAB CLOSES AND OPENS THIS TAB'S SOCKET (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# Only another tab's sign-in as this tab's person opens the socket again; a
# refresh, a profile change, a sign-out or somebody else's sign-in leaves it
# be. Drop that test and every write to the shared storage closes the tab's
# socket and opens it again on whatever session the browser's cookie holds:
# after a sign-out, none, and after somebody else's sign-in, theirs.
#
# Reddens: unit: realtime.test.ts "a write by another tab that is not this person signing in — a refresh, a sign-out, somebody else, another key — leaves this tab’s socket be"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = "  if (!sock || change.key !== authKey || !signedInElsewhere(change.oldValue, change.newValue, here)) return\n"
b = "  if (!sock) return\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-9-every-write-reopens-the-socket-unit: every write by another tab closes and opens this tab’s socket')
