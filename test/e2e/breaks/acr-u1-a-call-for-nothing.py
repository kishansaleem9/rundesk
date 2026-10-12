# A CALL CAN COST NOTHING.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: unit: credits.test.ts "a call costs its estimated cost at a tenth of a cent a credit, and never nothing"
#
# Credits are the cost rounded down, with no minimum.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/credits.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  return Math.max(1, Math.ceil(estimateAiCostUsd(model, inputTokens, outputTokens) / USD_PER_CREDIT - 1e-9))",
     "  return Math.floor(estimateAiCostUsd(model, inputTokens, outputTokens) / USD_PER_CREDIT)"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-u1-a-call-for-nothing: A CALL CAN COST NOTHING.')
