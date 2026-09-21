# The visibility patch goes to the space rather than to the folder that was just made.
# Reddens: folder-dialog: the patch went to THAT folder's id carrying visibility: private
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '          await api(`/spaces/${spaceId}/folders/${folder.id}`, {\n'
b = '          await api(`/spaces/${spaceId}/folders/${spaceId}`, {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The visibility patch goes to the space rather than to the folder that was just made.')
