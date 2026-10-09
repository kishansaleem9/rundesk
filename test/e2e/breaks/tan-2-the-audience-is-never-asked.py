# OWNERS AND ADMINS ONLY MEANS NOTHING: the audience is never asked.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "set to owners and admins only — by the admin, not a member (403), and only to a known audience (400) — Analytics refuses a member in words (403) and answers the admin"
#   or "the admin’s audience is saved from the page and a member opening Analytics then reads why not; turned off from the page, it says it is off and offers the admin Turn on again (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/team-analytics/team-analytics.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (who.audience === 'admins' && !who.isAdmin) throw new ForbiddenException(ANALYTICS_REFUSALS.admins)\n",
     '    // BROKEN: the audience is never asked\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-2-the-audience-is-never-asked: the audience is never asked')
