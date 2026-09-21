# The same file staged twice draws two rows nobody can tell apart.
# Reddens: attach-on-create: picking an already-staged file again does not draw a second row
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '        if (seen.has(`${file.name}:${file.size}`)) continue\n'
b = '        if (false) continue\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The same file staged twice draws two rows nobody can tell apart.')
