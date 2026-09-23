# THE MIRROR DEFECT, and the one this row was nearly shipped as. The column
# exists, the create dialog writes it, Postgres holds it — and no surface reads
# it back, because `fields.description` is off for folders. Every check about
# the write still passes. The words are in the database for ever and nobody can
# see them.
# Reddens: folder-dialog: "reopening the folder shows the description back"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "        fields={treeEdit?.kind === 'folder' ? { description: true } : undefined}"
b = "        fields={undefined}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the folder edit dialog no longer shows a description at all.')
