# ANY NUMBER OF PACKS IS ONE PURCHASE.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: unit: credits.test.ts "credits are bought in whole packs of 10,000, one to a hundred"
#
# There is no most.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/credits.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  return packs >= 1 && packs <= MAX_PACKS ? packs : null",
     "  return packs >= 1 ? packs : null"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-u3-any-number-of-packs: ANY NUMBER OF PACKS IS ONE PURCHASE.')
