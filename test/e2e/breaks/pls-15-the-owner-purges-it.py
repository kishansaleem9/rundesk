# THE OWNER DELETES FOR GOOD WHAT WAS DELETED FROM SOMEBODY’S PERSONAL LIST.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "deleted, it is in her Trash, where it is named “Personal List” — and not in the owner’s, who cannot find it there to delete it for good (404)"
#
# Found by id, a Personal List’s task in the bin is the owner’s to purge, though the Trash never showed it.
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if ('personalOf' in row && row.personalOf && row.personalOf !== actorId) throw new NotFoundException('Item not found in this workspace trash')\n",
     "    if ('personalOf' in row && row.personalOf && false) throw new NotFoundException('Item not found in this workspace trash') // BROKEN\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-15-the-owner-purges-it: THE OWNER DELETES FOR GOOD WHAT WAS DELETED FROM SOMEBODY’S PERSONAL LIST.')
