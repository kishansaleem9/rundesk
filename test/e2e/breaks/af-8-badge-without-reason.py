# "Failed" with nothing a person can act on.
# Reddens: ai-activity-filters: "and its badge carries the failure’s own sentence"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-value-panel.tsx'
a = "                    title={run.errorMessage ?? ''}"
b = '                    title=""'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-value-panel.tsx: the failed badge no longer carries the failure message.')
