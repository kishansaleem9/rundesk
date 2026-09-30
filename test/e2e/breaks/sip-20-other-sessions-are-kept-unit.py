# A PASSWORD CHANGE KEEPS EVERY OTHER SESSION AGAIN, READ FROM THE TRANSACTION (`found-30-sep/password-change-unthrottled`).
#
# `sip-19`'s edit, claimed by the unit test: the transaction writes the
# password and no session.
#
# Reddens: unit: users.service.test.ts "a change revokes every other session of the account in the transaction that writes the password, and keeps the one the caller’s refresh token names, hashed or as stored before hashing"
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
print('sip-20-other-sessions-are-kept-unit: the change revokes no session')
