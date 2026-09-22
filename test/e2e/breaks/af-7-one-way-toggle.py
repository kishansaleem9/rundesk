# A toggle that is dead on the second press.
# Reddens: ai-activity-filters: "and `userId` is gone from the next thing the page asks for"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-value-panel.tsx'
a = '              onClick={() => setMineOnly((v) => !v)}'
b = '              onClick={() => setMineOnly(true)}'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-value-panel.tsx: "My runs" can be switched on and never off.')
