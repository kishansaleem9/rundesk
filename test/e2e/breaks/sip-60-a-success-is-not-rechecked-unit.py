# A SUCCESSFUL SIGN-IN IS NOT RE-CHECKED AGAINST THE LOCK, READ FROM THE SERVICE (`found-30-sep/a-burst-is-compared-before-the-lock`).
#
# `sip-59`'s edit, claimed by the unit test: a right password that finds the
# account locked now signs in instead of being refused.
#
# Reddens: unit: auth.service.test.ts "a right password that finds the account locked (a burst of wrong passwords locked it while this one compared) is refused, not signed in"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = (
    "    if (settings.lockoutEnabled) {\n"
    "      const cleared = await clearLockoutIfUnlocked(this.db, user.id, now)\n"
    "      if (!cleared) throw new UnauthorizedException('Invalid credentials')\n"
    "    } else if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {\n"
)
b = (
    "    if (settings.lockoutEnabled) {\n"
    "      await clearLockoutIfUnlocked(this.db, user.id, now)\n"
    "    } else if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-60-a-success-is-not-rechecked-unit: a success signs in though the account is locked')
