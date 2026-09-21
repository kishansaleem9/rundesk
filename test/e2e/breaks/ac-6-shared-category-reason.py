# Two unfillable tiles sharing one explanation.
# Reddens: ai-action-categories: "with a DIFFERENT reason each — one shared reason explains nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-categories.ts'
a = "  externalSearches: 'aiValue.reasonNoConnectedAppSearch',"
b = "  externalSearches: 'aiValue.reasonNoConnectedAppActions',"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-categories.ts: External app searches now borrows the External app actions reason.')
