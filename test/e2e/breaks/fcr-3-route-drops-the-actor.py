# THE ROUTE DROPS WHO IS ASKING: the service, given no actor, asks no rule of a rename.
# Reddens: folder-change-rule: "a member of a view-only space renames no folder, makes none private and deletes none (403 each), and each stays as it was"
#   or "at Full edit a member still changes no folder an admin made — renaming, making private and deleting are refused, as moving it already was"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "    return this.folders.update(spaceId, folderId, body, user.id)\n"
b = "    void user\n    return this.folders.update(spaceId, folderId, body)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fcr-3-route-drops-the-actor: the controller passes no actor')
