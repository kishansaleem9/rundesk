# A query that matches nothing draws an empty strip instead of saying so.
# Reddens: create-menu-ai: "a query that matches nothing SAYS so, instead of drawing an empty strip"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '          {typeMatchCount === 0 && (\n'
b = '          {false && typeMatchCount === 0 && (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: A query that matches nothing draws an empty strip instead of saying so.')
