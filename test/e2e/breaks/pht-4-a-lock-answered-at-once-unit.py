# A LOCKED ACCOUNT IS ANSWERED AT ONCE AGAIN, READ FROM ITS COMPARE (`found-30-sep/sign-in-time-tells-an-account`).
#
# `pht-3`'s edit, claimed by the unit test: the compare is still started, and
# the refusal is sent without waiting for it.
#
# Reddens: unit: auth.service.test.ts "a locked account’s refusal is not sent before its compare has finished"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = (
    "    if (settings.lockoutEnabled && user.lockedUntil && new Date(user.lockedUntil) > now) {\n"
    "      await matches\n"
    "      throw new UnauthorizedException('Invalid credentials')\n"
    "    }\n"
)
b = (
    "    if (settings.lockoutEnabled && user.lockedUntil && new Date(user.lockedUntil) > now) {\n"
    "      throw new UnauthorizedException('Invalid credentials')\n"
    "    }\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pht-4-a-lock-answered-at-once-unit: a locked account is refused before its compare ends')
