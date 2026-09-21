# Take the constraint out of the DATABASE and leave it in the service only.
# Every API check still passes; the direct insert stops being refused, which is
# the one check that proves the rule survives a code path that forgets to ask.
# Reddens: folder-create: "a direct insert of a duplicate is refused by the index itself"
import io
p = '/home/user/rundesk/packages/db/src/schema/folders.ts'
a = "    uniqueIndex('uq_folders_space_name_active')\n      .on(t.spaceId, sql`lower(${t.name})`)\n      .where(sql`${t.isArchived} = false`),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ""))
print('folders.ts: the unique index is gone from the schema — the rule lives only in the service now.')
