# The toggle stops reaching the server: it moves a switch and the folder stays public.
# Reddens: folder-dialog: "exactly one visibility patch goes out"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '      if (isPrivate && folder?.id) {\n'
b = '      if (false && isPrivate && folder?.id) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The toggle stops reaching the server: it moves a switch and the folder stays public.')
