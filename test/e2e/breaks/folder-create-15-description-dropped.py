# THE FOLDER FORM SENDS NO DESCRIPTION: the words typed into it are lost, as
# the sidebar's own dialog lost them by never asking.
# Reddens: folder-create: "and it holds what the dialog was given from the sidebar — its description, and private"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '        body: { name, description, statusScope },\n'
b = '        body: { name, statusScope },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('folder-create-15-description-dropped: the Folder form drops the description')
