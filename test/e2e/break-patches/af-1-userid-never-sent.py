# The original defect restored: the toggle renders and the request is unchanged.
# Reddens: ai-activity-filters: "pressing \"My runs\" puts `userId` in the query string"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-value-panel.tsx'
a = "    if (mineOnly && myUserId) q.set('userId', myUserId)\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-value-panel.tsx: the "My runs" toggle no longer puts userId in the query string.')
