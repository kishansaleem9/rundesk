# A CALL THE MODEL ANSWERS COSTS NO CREDITS.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "a call the model answers costs credits — its cost at a tenth of a cent a credit, at least one — and the month’s use counts it (read by SQL)"
#
# What a call used is not written.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        credits: creditsFor(model, inputTokens, outputTokens),",
     "        credits: creditsFor(model, inputTokens, outputTokens) * 0,"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-3-a-call-costs-nothing: A CALL THE MODEL ANSWERS COSTS NO CREDITS.')
