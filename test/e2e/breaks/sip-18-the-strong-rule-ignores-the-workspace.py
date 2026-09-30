# THE STRONG-PASSWORD RULE IGNORES THE WORKSPACE (`found-30-sep/password-change-unthrottled`).
#
# The change asks the strong rule whatever the workspace says, so a workspace
# that switched strong passwords off still has its people refused an
# eight-character one: it is no longer the workspace's policy, as reset's is.
#
# Reddens: sign-in-and-password:
#   "the policy is the workspace’s: with strong passwords not required there, an eight-character password is accepted and signs in"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = "      requireStrong: settings.requireStrongPasswords,\n"
b = "      requireStrong: true,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-18-the-strong-rule-ignores-the-workspace: the change always asks the strong rule')
