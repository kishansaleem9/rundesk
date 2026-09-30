# A PAGE'S BUDGET IS 200, READ FROM THE CONSTANT (`found-30-sep/public-routes-unthrottled`).
#
# `prl-6`'s edit, claimed by the unit test: every page route still carries a
# policy and a guard, and the number they carry is not the one promised.
#
# Reddens: unit: public-route-limits.test.ts "the budgets are 120 a minute for a page and 1,200 for a picture, ten times as many"
import io
p = '/home/user/rundesk/apps/api/src/common/guards/rate-limit.guard.ts'
a = "  page: { limit: 120, windowMs: 60_000 },\n"
b = "  page: { limit: 200, windowMs: 60_000 },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-14-a-page-budget-of-two-hundred-unit: a page may be opened 200 times a minute')
