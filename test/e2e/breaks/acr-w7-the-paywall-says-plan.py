# THE PAYWALL SAYS ONLY THAT THE PLAN LACKS IT, NOT THAT ITS USES ARE SPENT.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "the paywall says the free uses are spent, and nothing made is lost"
#
# Spent uses are not told apart.
import io
p = '/home/user/rundesk/apps/web/src/components/feature-gate.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const usesSpent = !!spent && spent.left === 0",
     "  const usesSpent = !!spent && spent.left < 0"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-w7-the-paywall-says-plan: THE PAYWALL SAYS ONLY THAT THE PLAN LACKS IT, NOT THAT ITS USES ARE SPENT.')
