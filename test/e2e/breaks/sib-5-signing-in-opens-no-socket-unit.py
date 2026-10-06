# SIGNING IN AGAIN ON THE TAB OPENS NO SOCKET, READ FROM `followSignedIn` (`found-30-sep/an-open-socket-outlives-its-session`).
#
# `sib-4`'s edit, claimed by the unit test: signing in leaves the tab's socket
# closed where it should open it on the new session's token.
#
# Reddens: unit: realtime.test.ts "signing out closes the tab’s socket, and signing in again opens it on the new session’s token"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = "    sock.auth = { token }\n    sock.connect()\n"
b = "    sock.auth = { token }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-5-signing-in-opens-no-socket-unit: signing in no longer opens the tab’s socket')
