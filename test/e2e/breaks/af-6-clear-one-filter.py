# A Clear filters that clears one of three.
# Reddens: ai-activity-filters: "Clear filters clears all three, not just the one it used to know about"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-value-panel.tsx'
a = '                    setMineOnly(false)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-value-panel.tsx: Clear filters leaves the "My runs" toggle on.')
