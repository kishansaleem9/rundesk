# Make the check ignore is_archived, so a folder in the Trash reserves its name
# for ever and deleting one then remaking it is refused.
# Reddens: folder-create: "and a deleted folder does not hold its name hostage"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = "          eq(folders.spaceId, spaceId),\n          eq(folders.isArchived, false),\n          sql`lower(${folders.name}) = lower(${trimmed})`,"
b = "          eq(folders.spaceId, spaceId),\n          sql`lower(${folders.name}) = lower(${trimmed})`,"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('folders.service.ts: binned folders now count against the namespace — a deleted name is reserved for ever.')
