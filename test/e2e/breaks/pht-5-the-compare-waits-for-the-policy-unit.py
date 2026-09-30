# A REAL ACCOUNT'S COMPARE WAITS FOR ITS SIGN-IN POLICY AGAIN (`found-30-sep/sign-in-time-tells-an-account`).
#
# The compare starts only once the account's policy has been read: a real
# account's refusal then takes a hash and two queries, where an email with no
# account takes the hash alone.
#
# Reddens: unit: auth.service.test.ts "an account’s compare starts before its sign-in policy is read, so the policy’s queries are not added to a refusal’s time"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = (
    "    const matches = passwords.compare(password, user.passwordHash)\n"
    "    matches.catch(() => undefined)\n"
    "    const { settings } = await this.securitySettings.getEffectiveForUser(user.id)\n"
)
b = (
    "    const { settings } = await this.securitySettings.getEffectiveForUser(user.id)\n"
    "    const matches = passwords.compare(password, user.passwordHash)\n"
    "    matches.catch(() => undefined)\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pht-5-the-compare-waits-for-the-policy-unit: the compare starts after the policy is read')
