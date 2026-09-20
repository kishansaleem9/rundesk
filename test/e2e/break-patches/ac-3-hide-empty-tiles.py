# A grid that grows and shrinks with the data, so it cannot be measured.
# Reddens: ai-action-categories: "eight of them, as the frames show" / "laid out as two rows of four"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-categories.ts'
a = '    categories: AI_CATEGORIES.map((c) => {'
b = '    categories: AI_CATEGORIES.filter((c) => acc.get(c)!.runs > 0).map((c) => {'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-categories.ts: categories with no runs are omitted from the roll-up.')
