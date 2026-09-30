# A REFRESH THE IP ALLOWLIST REFUSES LEAVES ITS SESSION LIVE (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# A refresh used to revoke its session before the allowlist was asked, so a
# refused refresh ended the session; with the session kept on a refresh, a
# refusal that does not end it leaves a refresh token usable again from an
# allowed address.
#
# Reddens: unit: auth.service.test.ts "a refresh the workspace’s IP allowlist refuses ends the session, as it did when a refresh revoked it first"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = (
    "      if (err instanceof ForbiddenException) {\n"
    "        await this.db.update(sessions).set({ isRevoked: true }).where(eq(sessions.id, session.id))\n"
    "      }\n"
)
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-43-a-refused-refresh-keeps-its-session-unit: a refused refresh ends nothing')
