# The picker takes one file again, so a second pick silently replaces the first.
# Reddens: attach-on-create: "the file input accepts several files at once"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '            type="file"\n            multiple\n'
b = '            type="file"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The picker takes one file again, so a second pick silently replaces the first.')
