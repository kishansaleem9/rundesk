# A NEW PASSWORD IS CHECKED FOR LENGTH ALONE AGAIN, READ FROM THE SERVICE (`found-30-sep/password-change-unthrottled`).
#
# `sip-16`'s edit, claimed by the unit test: the change never asks the
# workspace's policy, so a weak password is written.
#
# Re-anchored 30 September with `sip-16`: the settings are read before the
# compare now, for the lockout (`found-30-sep/password-change-guesses-600-an-hour`).
#
# Reddens: unit: users.service.test.ts "the new password is held to the workspace’s password policy: a weak one is refused 400 saying what it lacks, and nothing is written"
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
print('sip-17-a-new-password-is-checked-for-length-alone-unit: the change applies no password policy')
