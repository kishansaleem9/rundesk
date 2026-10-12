# FREE USES ARE NEVER SPENT.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "with its sixty uses spent, Team View is refused in words — nothing made with it lost — to a member with no use today, and not to one who already has today’s"
#
# The allowance is not asked.
import io
p = '/home/user/rundesk/apps/api/src/modules/plans/plans.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        where (select count(*) from ${planFeatureUses} where workspace_id = ${workspaceId} and feature = ${feature}) < ${free}",
     "        where (select count(*) from ${planFeatureUses} where workspace_id = ${workspaceId} and feature = ${feature}) >= 0"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-12-uses-never-spent: FREE USES ARE NEVER SPENT.')
