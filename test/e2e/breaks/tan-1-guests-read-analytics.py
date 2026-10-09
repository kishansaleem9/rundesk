# A GUEST READS ANALYTICS: the refusal is gone.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "Analytics is off until turned on: the admin is told so and may turn it on, a member is told so and may not, and a guest is refused in words (403)"
import io
p = '/home/user/rundesk/apps/api/src/modules/team-analytics/team-analytics.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (membership?.role === 'guest' && !superAdmin) throw new ForbiddenException(ANALYTICS_REFUSALS.guest)\n",
     '    // BROKEN: a guest reads Analytics\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-1-guests-read-analytics: guests read analytics')
