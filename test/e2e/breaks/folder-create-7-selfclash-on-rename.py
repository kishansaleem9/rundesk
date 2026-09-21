# Drop the "except this folder" exclusion, so a folder clashes with ITSELF and
# cannot keep its own name. The trap is that the refusal checks all still pass.
# Reddens: folder-create: "while renaming a folder to its own name is still allowed"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = "          exceptFolderId ? ne(folders.id, exceptFolderId) : undefined,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ""))
print('folders.service.ts: the rename check no longer excludes the folder being renamed — it clashes with itself.')
