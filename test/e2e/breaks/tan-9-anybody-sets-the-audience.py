# ANYBODY SETS WHO SEES ANALYTICS.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "set to owners and admins only — by the admin, not a member (403), and only to a known audience (400) — Analytics refuses a member in words (403) and answers the admin"
import io
p = '/home/user/rundesk/apps/api/src/modules/team-analytics/team-analytics.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (!who.mayManage) throw new ForbiddenException('Setting who sees Analytics takes the Manage ClickApps permission')\n",
     '    // BROKEN: anybody sets the audience\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-9-anybody-sets-the-audience: anybody sets the audience')
