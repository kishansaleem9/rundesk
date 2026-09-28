# DELETING ASKS ONLY WHAT CHANGING ASKS: Full edit is not asked to delete a folder.
# Reddens: unit: folders.service.test.ts "archives the folder (never hard-deletes) and stamps who/when"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (actorId) await this.assertMayChange(spaceId, folderId, actorId, 'delete')\n"
b = "    if (actorId) await this.assertMayChange(spaceId, folderId, actorId, 'manage')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fcr-4-deleting-asks-the-edit-level: remove asks the manage level')
