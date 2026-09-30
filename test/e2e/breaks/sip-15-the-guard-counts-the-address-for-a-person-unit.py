# THE GUARD COUNTS THE ADDRESS WHERE A POLICY SAYS THE PERSON (`found-30-sep/password-change-unthrottled`).
#
# `RateLimitGuard.counted` reads the signed-in person and then keys the budget
# by the address anyway, so `per: 'user'` means nothing.
#
# Reddens: unit: rate-limit.guard.test.ts "a per-user policy spends the signed-in person’s budget: the same person from another address is refused, and another person at the first address is served"
import io
p = '/home/user/rundesk/apps/api/src/common/guards/rate-limit.guard.ts'
a = "      if (typeof id === 'string' && id.length > 0) return `user:${id}`\n"
b = "      if (typeof id === 'string' && id.length > 0) return this.clientIp(req)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-15-the-guard-counts-the-address-for-a-person-unit: a per-user policy is counted by address')
