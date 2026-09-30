# THE NO-ACCOUNT HASH IS MADE AT COST 10 (`found-30-sep/sign-in-time-tells-an-account`).
#
# Every refusal still compares, but an email with no account compares with a
# hash a quarter as costly as a real password's: about 75 ms where a real
# account's wrong password takes 300. The saving is the tell.
#
# Reddens: password-hash-time:
#   "a sign-in with an email that has no account is refused in the time a real account’s wrong password takes: over nine of each, their medians are within a fifth of each other"
import io
p = '/home/user/rundesk/apps/api/src/common/security/password-hash.ts'
a = "export const NO_ACCOUNT_HASH = '$2b$12$gj0xZAp/j34YkjG5SpT3MOknobrzWU8VeW4ECGW9vYxqbwNVC1T.6'\n"
b = "export const NO_ACCOUNT_HASH = '$2b$10$1RV5a/YfS98Mq6w7Palkn.2xFyhM7txeIDrFdSIXPLiaJIea0N98m'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pht-11-the-no-account-hash-is-cheaper: the no-account hash is made at cost 10')
