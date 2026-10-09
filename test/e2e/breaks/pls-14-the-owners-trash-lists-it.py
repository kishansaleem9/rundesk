# THE OWNER’S TRASH LISTS WHAT WAS DELETED FROM SOMEBODY’S PERSONAL LIST.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "deleted, it is in her Trash, where it is named “Personal List” — and not in the owner’s, who cannot find it there to delete it for good (404)"
#
# An admin’s Trash holds the public items; this holds a private list’s too.
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        .where(and(eq(spaces.workspaceId, workspaceId), isNotNull(tasks.deletedAt), personalListOpenTo(actor.id)))',
     '        .where(and(eq(spaces.workspaceId, workspaceId), isNotNull(tasks.deletedAt))) // BROKEN'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-14-the-owners-trash-lists-it: THE OWNER’S TRASH LISTS WHAT WAS DELETED FROM SOMEBODY’S PERSONAL LIST.')
