# AN EMAIL WITH NO ACCOUNT IS ANSWERED AT ONCE AGAIN, READ FROM ITS COMPARES (`found-30-sep/sign-in-time-tells-an-account`).
#
# `pht-1`'s edit, claimed by the unit test: the refusal of an email with no
# account compares nothing.
#
# Reddens: unit: auth.service.test.ts "an email with no account is refused after a compare with NO_ACCOUNT_HASH"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = (
    "    if (!user?.passwordHash) {\n"
    "      await passwords.compare(password, NO_ACCOUNT_HASH)\n"
    "      throw new UnauthorizedException('Invalid credentials')\n"
    "    }\n"
)
b = (
    "    if (!user?.passwordHash) {\n"
    "      throw new UnauthorizedException('Invalid credentials')\n"
    "    }\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pht-2-no-account-answered-at-once-unit: no account is refused before any hashing')
