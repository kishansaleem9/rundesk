# A WRONG PASSWORD IS READ WITH THE ACCOUNT AND WRITTEN BACK PLUS ONE AGAIN, READ FROM THE STATEMENT (`found-30-sep/lockout-counts-overlapping-attempts-once`).
#
# `sip-1`'s edit, claimed by the unit test: the count written is a number
# read with the account, not the row's own plus one.
#
# Reddens: unit: auth.service.test.ts "a wrong password is counted by the row, in one statement: failed_login_attempts + 1, never a number read with the account"
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
print('sip-2-a-wrong-password-is-read-then-written-unit: the count is read with the account and written back plus one')
