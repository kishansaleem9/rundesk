# The note stops naming the Space, so you cannot tell which one you copied.
# Reddens: space-wizard: and says where they came from, by name
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = '    setCopiedFrom(source.name)\n'
b = "    setCopiedFrom('another Space')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: The note stops naming the Space, so you cannot tell which one you copied.')
