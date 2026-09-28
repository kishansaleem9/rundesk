# A COMMENT SHARE DELETES THE DOC: deleting asks commenting.
# Reddens: doc-trash-level: "a Comment share neither deletes nor archives the doc (403 each), and it stays"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.assertDocLevel(docId, userId, 'edit')\n"
b = "    await this.assertDocLevel(docId, userId, 'comment')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dtl-4-delete-at-comment: done')
