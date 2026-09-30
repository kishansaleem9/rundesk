# A LOCKED ACCOUNT IS ANSWERED AT ONCE AGAIN (`found-30-sep/sign-in-time-tells-an-account`).
#
# The lock's refusal no longer waits for the account's compare: a locked
# account is refused in the time two queries take, a real account's wrong
# password after a hash, and an email with no account after a hash too. The
# quick "Invalid credentials" says the account exists, and is locked.
#
# Reddens: password-hash-time:
#   "a locked account’s sign-in is refused in that time too: over nine, its median is within a fifth of a real account’s wrong password"
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
print('pht-3-a-lock-answered-at-once: a locked account is refused before its compare ends')
