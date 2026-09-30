# A REFRESH ENDS ITS SESSION AND MAKES ANOTHER AGAIN (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# The row the refresh token names is revoked and a new one made, as refresh did
# before sessions were named. Now that an access token names its session, that
# voids every access token made before the refresh: a browser's requests in
# flight across one are refused, and refresh again, each voiding the last.
#
# Reddens: sign-in-and-password:
#   "a refresh keeps its session: the access token from before it still reads, as does the new one, and the refresh token it replaced is refused 401"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = "      return await this.login(user, meta, { sessionId: session.id, refreshTokenHash: session.refreshToken })\n"
b = (
    "      await this.db.update(sessions).set({ isRevoked: true }).where(eq(sessions.id, session.id))\n"
    "      return await this.login(user, meta)\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-39-a-refresh-makes-a-new-session: a refresh revokes its session and makes another')
