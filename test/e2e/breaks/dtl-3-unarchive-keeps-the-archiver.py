# UNARCHIVING LEAVES WHO ARCHIVED IT AND WHEN on a doc that is back.
# Reddens: doc-trash-level: "unarchiving it at Edit brings it back and clears who archived it and when, and it leaves their Trash"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (writable.isArchived === false) {\n'
b = '    if (writable.isArchived === false && Boolean(0)) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dtl-3-unarchive-keeps-the-archiver: done')
