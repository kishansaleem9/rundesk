# The clear button stops clearing, so a narrowed strip can never be widened again.
# Reddens: create-menu-ai: "clearing the box brings every type back — the narrowing goes both ways"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "                onClick={() => setQuery('')}\n"
b = '                onClick={() => { /* one-way */ }}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The clear button stops clearing, so a narrowed strip can never be widened again.')
