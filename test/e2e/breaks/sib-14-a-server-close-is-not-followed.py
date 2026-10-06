# A SOCKET THE SERVER CLOSED IS NOT OPENED AGAIN (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# A sign-in in another tab that is not after a sign-out writes the same person,
# or nothing new, so no storage event says it; under a policy of one session
# at a time the server closes this tab's socket with the old session. The tab
# asks the browser's session who it is and opens the socket again when it is
# still its person. Drop that and the tab stays deaf until it is reloaded.
#
# Reddens: session-in-the-browser:
#   "when the person signs in again from one tab without signing out, under a policy of one session at a time, another tab of the same browser opens its realtime socket again on the new session without a reload, and the list it shows draws a task a colleague makes after, as before"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '    void followServerClose(socket, reason, () => useAuthStore.getState().user?.id ?? null, whoTheBrowserIsSignedInAs)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-14-a-server-close-is-not-followed: a socket the server closed is never opened again')
