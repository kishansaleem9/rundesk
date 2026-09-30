# A PASSWORD CHANGE IS COUNTED PER ADDRESS, NOT PER PERSON, READ FROM THE BUDGET (`found-30-sep/password-change-unthrottled`).
#
# `sip-14`'s edit, claimed by the unit test: the budget no longer says whose
# it is, so it is an address's.
#
# Reddens: unit: auth-route-limits.test.ts "the budget is sign-in’s ten a minute, counted per person, not per address"
import io
p = '/home/user/rundesk/apps/api/src/common/guards/auth-route-limits.ts'
a = "  passwordChange: { limit: 10, windowMs: 60_000, per: 'user' },\n"
b = "  passwordChange: { limit: 10, windowMs: 60_000 },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-23-a-password-change-is-counted-per-address-unit: the password change is counted per address')
