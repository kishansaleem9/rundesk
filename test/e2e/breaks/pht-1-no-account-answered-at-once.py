# AN EMAIL WITH NO ACCOUNT IS ANSWERED AT ONCE AGAIN (`found-30-sep/sign-in-time-tells-an-account`).
#
# The compare with the no-account hash goes: an email with no account, or an
# account with no password, is refused before any hashing, in a few
# milliseconds, and a real account's wrong password after a hash. The time of
# the same "Invalid credentials" says whether an account exists.
#
# Reddens: password-hash-time:
#   "a sign-in with an email that has no account is refused in the time a real account’s wrong password takes: over nine of each, their medians are within a fifth of each other"
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
print('pht-1-no-account-answered-at-once: no account is refused before any hashing')
