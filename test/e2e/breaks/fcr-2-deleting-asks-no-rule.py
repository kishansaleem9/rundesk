# DELETING A FOLDER ASKS NO RULE AGAIN: any reader of the space sends it to the Trash.
# Reddens: folder-change-rule: "a member of a view-only space renames no folder, makes none private and deletes none (403 each), and each stays as it was"
#   or "at Full edit a member still changes no folder an admin made — renaming, making private and deleting are refused, as moving it already was"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (actorId) await this.assertMayChange(spaceId, folderId, actorId, 'delete')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('fcr-2-deleting-asks-no-rule: remove asks nothing')
