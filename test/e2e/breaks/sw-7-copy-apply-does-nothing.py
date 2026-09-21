# Apply records where it copied from and copies nothing — the mirror of the facade, on screen.
# Reddens: space-wizard: Apply puts the source Space's own views into this wizard
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = "    if (copyParts.includes('views')) {\n"
b = "    if (false && copyParts.includes('views')) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: Apply records where it copied from and copies nothing — the mirror of the facade, on screen.')
