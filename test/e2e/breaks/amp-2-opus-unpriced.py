# A routable tier with no row in the pricing table. `estimateAiCostUsd` falls back to
# { in: 1, out: 5 } — the Haiku price — so every Opus run reports a fifth of what it
# cost, in the panel whose whole subject is what the AI cost. No error anywhere.
# Reddens: unit: model-tiers.test.ts "prices every routable tier, so no tier bills at the fallback rate"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-cost.ts'
a = "  'claude-opus-5': { in: 5, out: 25 },\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-cost.ts: claude-opus-5 now bills at the unknown-model fallback rate.')
