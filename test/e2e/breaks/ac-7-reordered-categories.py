# The frame’s order replaced by some other order.
# Reddens: ai-action-categories: "in the frame’s order, not the data’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-categories.ts'
a = "  'tasks',\n  'docs',"
b = "  'docs',\n  'tasks',"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-categories.ts: Docs is returned before Tasks, against the frame.')
