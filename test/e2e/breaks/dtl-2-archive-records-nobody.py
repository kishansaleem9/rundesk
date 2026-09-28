# ARCHIVING THROUGH THE DOC RECORDS NOBODY: the flag alone, as before.
# Reddens: doc-trash-level: "archiving a doc through the doc itself records who archived it and when, as deleting does, so it is in their own Trash"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (writable.isArchived === true && !doc.isArchived) {\n'
b = '    if (writable.isArchived === true && !doc.isArchived && Boolean(0)) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dtl-2-archive-records-nobody: done')
