# AN ACCESS TOKEN IS CHECKED FOR ITS SIGNATURE ALONE AGAIN, READ FROM THE STRATEGY (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# `sip-37`'s edit, claimed by the unit test: `validate` lets in a token whose
# session is revoked, expired, another person's or gone.
#
# Reddens: unit: jwt.strategy.test.ts "validate refuses a token whose session is revoked, past its window, another person’s or gone, and one that names no session"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/strategies/jwt.strategy.ts'
a = "    if (!(await sessionIsLive(this.db, payload))) throw new UnauthorizedException('Session ended')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-38-the-strategy-asks-no-session-unit: an access token is checked for its signature alone')
