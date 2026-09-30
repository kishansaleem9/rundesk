# A REFRESH ENDS ITS SESSION AND MAKES ANOTHER AGAIN, READ FROM THE SERVICE (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# `sip-39`'s edit, claimed by the unit test: the refreshed access token names a
# new session, a row is inserted and the old one revoked.
#
# Reddens: unit: auth.service.test.ts "a refresh keeps its session: the row the refresh token names gets the new refresh token and window, matched on the old one and on being live, and nothing is inserted or revoked"
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
print('sip-40-a-refresh-makes-a-new-session-unit: a refresh revokes its session and makes another')
