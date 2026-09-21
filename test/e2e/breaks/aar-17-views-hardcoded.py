# The sentence offers List and Board whatever the created list actually has — a fact
# about what a list USUALLY offers, printed as a fact about this one. The same failure
# the "with standard task statuses" clause was written to avoid.
# Reddens: unit: ai-containers.test.ts "does NOT offer a view the space does not enable"
#                                      "says nothing about views when the list exposes none this build can draw"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-containers.ts'
a = "  const offers = result.views"
b = "  const offers = ['list', 'board']"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-containers.ts: the success sentence always offers List and Board.')
