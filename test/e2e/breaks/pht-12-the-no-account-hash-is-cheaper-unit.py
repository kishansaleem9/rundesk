# THE NO-ACCOUNT HASH IS MADE AT COST 10, READ FROM ITS ROUNDS (`found-30-sep/sign-in-time-tells-an-account`).
#
# `pht-11`'s edit, claimed by the unit test: the hash a missing account's
# sign-in compares is cheaper than any password's.
#
# Reddens: unit: password-hash.test.ts "NO_ACCOUNT_HASH is a bcrypt hash at the cost every password has, and matches nothing a sign-in sends"
import io
p = '/home/user/rundesk/apps/api/src/common/security/password-hash.ts'
a = "export const NO_ACCOUNT_HASH = '$2b$12$gj0xZAp/j34YkjG5SpT3MOknobrzWU8VeW4ECGW9vYxqbwNVC1T.6'\n"
b = "export const NO_ACCOUNT_HASH = '$2b$10$1RV5a/YfS98Mq6w7Palkn.2xFyhM7txeIDrFdSIXPLiaJIea0N98m'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pht-12-the-no-account-hash-is-cheaper-unit: the no-account hash is made at cost 10')
