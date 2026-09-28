# Leave the rename path unguarded — the second door onto the namespace.
# Create still refuses; renaming onto a taken name reaches the index and 500s.
# Reddens: folder-create: "renaming a folder onto a taken name is refused by the SERVICE, in its own words"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = "    if (patch.name !== undefined) await this.assertFolderNameFree(spaceId, patch.name, folderId)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ""))
print('folders.service.ts: rename no longer checks the name — make "Clients 2", rename it, and the index answers with a 500.')
