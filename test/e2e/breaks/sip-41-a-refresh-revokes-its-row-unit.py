# A REFRESH REVOKES THE ROW IT FOUND, READ FROM THE LOOKUP'S TEST (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# `sip-39`'s edit, claimed by the test of the refresh's lookup: the row found
# by the token's hash is revoked, and login is not asked to keep it.
#
# Reddens: unit: auth.service.test.ts "looks the session up by the token hash, then keeps it: login rotates that row, and no row is revoked"
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
print('sip-41-a-refresh-revokes-its-row-unit: a refresh revokes its session and makes another')
