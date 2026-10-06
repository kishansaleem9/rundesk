# THE SAME PERSON'S SOCKET IS CLOSED AND OPENED AGAIN ON EVERY CHANGE TO THE STORE (`found-30-sep/an-open-socket-outlives-its-session`).
#
# The tab's socket follows who is signed in: it is closed at sign-out and opened
# at sign-in, and a store change that keeps the same person (a refresh, a
# profile change) leaves it be. Drop that and every such change drops the
# socket's rooms and opens it anew.
#
# Reddens: unit: realtime.test.ts "the same person staying signed in (a refresh, a profile change) leaves the tab’s socket as it is"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = "  if (!sock || was === now) return\n"
b = "  if (!sock) return\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-6-the-same-person-churns-the-socket-unit: a change that keeps the same person closes and opens the socket')
