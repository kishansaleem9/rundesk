# A SUCCESSFUL SIGN-IN IS NOT RE-CHECKED AGAINST THE LOCK (`found-30-sep/a-burst-is-compared-before-the-lock`).
#
# A compare takes a hash's time; the lock is read once, before it. A burst of
# wrong passwords and the account's right one, sent at once, each read an
# unlocked account and each was compared; the wrong ones locked the account as
# they finished, and the right one among them signed in. The fix refuses a
# success that finds the account locked now; this drops the refusal, so a right
# password among a burst that locked the account signs in again.
#
# Reddens: sign-in-and-password:
#   "twenty wrong passwords and the right one sent at once are all refused 401 once five have been counted: the burst locks the account (failed_login_attempts 0), the right one among them signs in nobody, and its right password alone is refused while the lock lasts"
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
print('sip-59-a-success-is-not-rechecked: a right password among a burst signs in though the burst locked the account')
