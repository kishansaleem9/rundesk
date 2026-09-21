# Take the join out from under the new lookup, leaving it selecting folder
# columns from a query that has no folders in its FROM. Postgres refuses, the
# createList path 500s, and NO list can be made in any project — the new reader
# breaking the writer it was added beside. This aborts the run, which is what
# the exact-count guard is for.
# Reddens: folder-dialog: "a list exists inside each folder to read the setting off"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = "      .innerJoin(folders, eq(folders.id, projects.folderId))\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lists.service.ts: the folder lookup lost its join — every list create now 500s.')
