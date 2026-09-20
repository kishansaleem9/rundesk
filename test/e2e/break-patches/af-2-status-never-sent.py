# The Status dropdown as a client-side no-op.
# Reddens: ai-activity-filters: "choosing Failed puts `status=failed` in the query string"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-value-panel.tsx'
a = "    if (status) q.set('status', status)\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-value-panel.tsx: the Status filter no longer reaches the server.')
