# The tile computing its own figure instead of showing the server’s.
# Reddens: ai-action-categories: "and a person can read that number on the tile"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-value-panel.tsx'
a = '{row?.runs ?? 0}</div>'
b = '{row?.features?.length ?? 0}</div>'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-value-panel.tsx: the tile prints how many feature strings fed it, not the run count.')
