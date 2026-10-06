# SIGNING IN AGAIN ON THE TAB OPENS NO SOCKET (`found-30-sep/an-open-socket-outlives-its-session`).
#
# The server ends a socket whose session has ended, and socket.io does not
# reconnect after the server closes a socket; the tab keeps one socket for its
# life. The web closes it when its person signs out and opens it again on the
# new session when somebody signs in. Drop the opening and a person who signs
# out and back in on the same tab has no socket until a reload: nothing they
# are sent arrives as it happens.
#
# Reddens: session-in-the-browser:
#   "signing out from the menu and back in on the same tab, without a reload, opens the tab’s realtime socket again on the new session: a message in the account’s own private channel is heard after it, as one was before"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = "    sock.auth = { token }\n    sock.connect()\n"
b = "    sock.auth = { token }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-4-signing-in-opens-no-socket: signing in no longer opens the tab’s socket')
