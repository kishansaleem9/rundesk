# Widen the scope past the space, so two spaces cannot each have a "Clients".
# Every refusal check still passes; only the scoping check fails.
# Reddens: folder-create: "the same name is fine in a different space"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = "          eq(folders.spaceId, spaceId),\n          eq(folders.isArchived, false),"
b = "          eq(folders.isArchived, false),"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('folders.service.ts: the name check no longer looks at the space — one "Clients" for the whole database.')
