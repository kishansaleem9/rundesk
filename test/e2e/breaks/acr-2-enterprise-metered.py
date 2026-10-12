# ENTERPRISE’S CREDITS ARE COUNTED.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "the month’s credits are the plan’s per member times its members — a guest brings none — unlimited on Enterprise, and renew on the 1st"
#
# The unlimited tier gets a number.
import io
p = '/home/user/rundesk/apps/api/src/modules/plans/plans.constants.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    limits: { maxMembers: null, maxProjects: null, aiCreditsPerMember: null },",
     "    limits: { maxMembers: null, maxProjects: null, aiCreditsPerMember: 2_500 },"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-2-enterprise-metered: ENTERPRISE’S CREDITS ARE COUNTED.')
