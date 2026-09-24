# MAKE PRIVATE IS NOT APPLIED: the folder asked to be private comes out open,
# as the sidebar's own dialog made every folder.
# Reddens: folder-create: "and it holds what the dialog was given from the sidebar — its description, and private"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '      if (isPrivate && folder?.id) {\n'
b = '      if (!isPrivate && folder?.id) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('folder-create-16-private-dropped: Make private is not applied')
