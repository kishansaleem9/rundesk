# A PASSWORD CHANGE KEEPS EVERY OTHER SESSION AGAIN (`found-30-sep/password-change-unthrottled`).
#
# The change writes the password and revokes nothing: a session somebody else
# holds, or a computer left signed in, goes on refreshing under the new
# password, where reset-password revokes them all.
#
# Re-measured 30 September (`found-30-sep/revoked-sessions-keep-their-access-tokens`):
# the session a change should have ended reads on, opens a socket and accepts
# an invitation for its account, so the checks that stand on a change ending it
# redden too.
#
# Reddens: sign-in-and-password:
#   "a change made as a browser makes it (its cookies and the CSRF header) signs out the account’s other sessions and keeps the browser’s: the other session’s refresh is refused 401, the browser’s answered 200"
#   "a change by a client naming its session in the body (currentRefreshToken) keeps it and signs out the other two: its refresh is answered 200, the other sign-in’s and the sign-up’s are refused 401, and the change says it revoked 2"
#   "a session a password change signs out is refused at once: its access token’s read (GET /users/me) is refused 401, as is the sign-up session’s, and its refresh is refused 401, while the session that made the change reads and refreshes on"
#   "a session that has ended opens no realtime socket: its access token’s handshake is ended with \"Session ended\", while the live session’s socket stays up"
#   "a session that has ended claims no invitation for its account: the claim reads its token as nobody’s and is refused 403 \"Account already exists\", and the account joins nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = (
    "      return tx\n"
    "        .update(sessions)\n"
    "        .set({ isRevoked: true })\n"
    "        .where(and(eq(sessions.userId, userId), eq(sessions.isRevoked, false), ...kept.map((token) => ne(sessions.refreshToken, token))))\n"
    "        .returning({ id: sessions.id })\n"
)
b = (
    "      void kept\n"
    "      return [] as Array<{ id: string }>\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-19-other-sessions-are-kept: the change revokes no session')
