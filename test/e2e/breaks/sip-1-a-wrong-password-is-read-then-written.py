# A WRONG PASSWORD IS READ WITH THE ACCOUNT AND WRITTEN BACK PLUS ONE AGAIN (`found-30-sep/lockout-counts-overlapping-attempts-once`).
#
# The count goes back to what it was: the number read with the account, plus
# one, written back, and the lock set when that number reaches the threshold.
# Wrong passwords that overlap each write the same next number, so four sent
# at once count as one, and five or eight at once lock nothing.
#
# Reddens: sign-in-and-password:
#   "four wrong passwords sent at once to one account, each from an address of its own, are four toward its lockout: failed_login_attempts reads 4 and the account is not locked"
#   "a fifth wrong password after them locks it at the policy’s five: it has a lock, and its right password is then refused 401"
#   "five wrong passwords sent at once lock it at once: it has a lock, and its right password is refused 401"
#   "eight sent at once lock it at the fifth and count none past it: it has a lock, failed_login_attempts reads 0, and its right password is refused 401"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = "      if (settings.lockoutEnabled) await this.countWrongPassword(user.id, settings, now)\n"
b = (
    "      if (settings.lockoutEnabled) {\n"
    "        const attempts = (user.failedLoginAttempts ?? 0) + 1\n"
    "        if (attempts >= settings.lockoutThreshold) {\n"
    "          const lockedUntil = new Date(now.getTime() + settings.lockoutDurationMinutes * 60000)\n"
    "          await this.db.update(users).set({ failedLoginAttempts: 0, lockedUntil }).where(eq(users.id, user.id))\n"
    "        } else {\n"
    "          await this.db.update(users).set({ failedLoginAttempts: attempts }).where(eq(users.id, user.id))\n"
    "        }\n"
    "      }\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-1-a-wrong-password-is-read-then-written: the count is read with the account and written back plus one')
