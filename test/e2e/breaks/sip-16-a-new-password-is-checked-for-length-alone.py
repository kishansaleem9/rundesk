# A NEW PASSWORD IS CHECKED FOR LENGTH ALONE AGAIN (`found-30-sep/password-change-unthrottled`).
#
# The change no longer holds the new password to the workspace's policy: any
# eight characters will do, `password1` among them, where sign-up and an
# invitation's claim ask ten, both cases, a number and a symbol, and reset asks
# the workspace's policy, which asks the same unless the workspace says not.
#
# Re-anchored 30 September: the workspace's settings are read before the
# current password is compared now, for its lockout
# (`found-30-sep/password-change-guesses-600-an-hour`), so the anchor is the
# policy's call alone; the edit still drops it.
#
# Reddens: sign-in-and-password:
#   "a weak new password is refused 400 under the workspace’s default policy, saying what it lacks, and the old password still signs in"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = (
    "    await this.securitySettings.enforcePasswordPolicy(newPassword, {\n"
    "      requireStrong: settings.requireStrongPasswords,\n"
    "      blockBreached: settings.blockBreachedPasswords,\n"
    "    })\n"
)
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-16-a-new-password-is-checked-for-length-alone: the change applies no password policy')
