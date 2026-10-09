# THE SHEET'S ESTIMATE FOLLOWS EDIT: a person who only views, allowed an estimate, is not offered one.
# (`found-25-sep/view-only-individual-permissions`)
# Reddens: view-only-permissions: "and the member’s sheet follows: Start timer and a manual entry again, no word that they may not track time, an estimate to type, and no tag to add"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('            pending={patchTask.isPending || !(caps.estimate ?? caps.edit)}\n',
     '            pending={patchTask.isPending || !caps.edit} // BROKEN: the estimate follows edit\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('vop-w2-the-estimate-follows-edit: the estimate follows edit')
