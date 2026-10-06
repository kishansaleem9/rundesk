# A CLEAN SUCCESS WRITES THE LOCKOUT EVEN WITH IT OFF (`found-30-sep/a-burst-is-compared-before-the-lock`).
#
# With the workspace lockout off, a successful sign-in on a clean account writes
# nothing (there is no count to clear). Make the write unconditional and a clean
# sign-in writes the lockout columns although the workspace does not use them.
#
# Reddens: unit: auth.service.test.ts "with the lockout off, a successful sign-in on a clean account writes nothing to the lockout"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = (
    "    } else if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {\n"
    "      await this.db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id))\n"
    "    }\n"
)
b = (
    "    } else {\n"
    "      await this.db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id))\n"
    "    }\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-63-the-lockout-off-success-writes-unit: a clean success writes the lockout with it off')
