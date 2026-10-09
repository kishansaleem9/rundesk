# THE TRASH NAMES A PERSONAL LIST’S TASK BY THE HIDDEN SPACE IT LIVES IN.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "deleted, it is in her Trash, where it is named “Personal List” — and not in the owner’s, who cannot find it there to delete it for good (404)"
#
# Its place reads “Personal › Lists › Personal List”, a place nobody can go to.
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        const location = r.personalOf ? r.listName : `${r.spaceName} › ${r.projectName} › ${r.listName}`\n',
     '        const location = `${r.spaceName} › ${r.projectName} › ${r.listName}` // BROKEN\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-17-the-trash-names-its-place: THE TRASH NAMES A PERSONAL LIST’S TASK BY THE HIDDEN SPACE IT LIVES IN.')
