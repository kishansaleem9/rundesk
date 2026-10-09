# An unmapped feature folded into a plausible neighbour instead of reported.
# Reddens: ai-action-categories: "eleven of the twelve seeded runs are in a tile — the twelfth has no category"
#   or "and the twelfth is REPORTED rather than dropped"
#   or "and nothing leaks into the buckets they do not belong to"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
#
# Re-aimed 8 October: two `image.generate` runs joined the seeds (`ledger-rows/row-870`), so the tenth is the twelfth.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-categories.ts'
a = '    const category = categoryOf(feature)'
b = "    const category = categoryOf(feature) ?? 'summaries'"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-categories.ts: features with no category are silently added to Summaries.')
