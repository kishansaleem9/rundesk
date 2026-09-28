# An unmapped feature folded into a plausible neighbour instead of reported.
# Reddens: ai-action-categories: "nine of the ten seeded runs are in a tile — the tenth has no category" / "and the tenth is REPORTED rather than dropped"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-categories.ts'
a = '    const category = categoryOf(feature)'
b = "    const category = categoryOf(feature) ?? 'summaries'"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-categories.ts: features with no category are silently added to Summaries.')
