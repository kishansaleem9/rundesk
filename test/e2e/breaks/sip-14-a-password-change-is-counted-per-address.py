# A PASSWORD CHANGE IS COUNTED PER ADDRESS, NOT PER PERSON (`found-30-sep/password-change-unthrottled`).
#
# The budget loses `per: 'user'`, so it is ten a minute per address like the
# routes with no session. A stolen session asks from a new address when one is
# spent and guesses on; and everybody behind one address shares ten changes.
#
# Re-aimed 30 September (`found-30-sep/password-change-guesses-600-an-hour`):
# a wrong current password is answered 403 now, so the sentence says so. The
# edit is unchanged.
#
# Reddens: sign-in-and-password:
#   "the budget is the person’s, not the address’s: the same person asking from another address in that minute is refused 429, and another person at the first address is answered 403"
import io
p = '/home/user/rundesk/apps/api/src/common/guards/auth-route-limits.ts'
a = "  passwordChange: { limit: 10, windowMs: 60_000, per: 'user' },\n"
b = "  passwordChange: { limit: 10, windowMs: 60_000 },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-14-a-password-change-is-counted-per-address: the password change is counted per address')
