# A PLAN THAT HAS THE FEATURE SPENDS USES OF IT.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "on Business, which has Team View, it is not counted, and no free uses are offered"
#
# The plan’s own features are counted too.
import io
p = '/home/user/rundesk/apps/api/src/modules/plans/plans.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (plan.features[feature] === true) return\n    const free = FEATURE_FREE_USES[feature]",
     "    if (plan.features[feature] === true && !FEATURE_FREE_USES[feature]) return\n    const free = FEATURE_FREE_USES[feature]"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-15-paid-plans-counted: A PLAN THAT HAS THE FEATURE SPENDS USES OF IT.')
