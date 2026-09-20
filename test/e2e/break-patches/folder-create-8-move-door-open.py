# Leave the THIRD door open: carrying a name into a space that already has it.
# Reddens: folder-create: "moving a folder into a space that already has that name is refused with a 409"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = "    await this.assertFolderNameFree(targetSpaceId, src.name, folderId)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ""))
print('folders.service.ts: move no longer checks the destination namespace — an ordinary move 500s on the index.')
