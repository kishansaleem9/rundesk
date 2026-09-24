# MOVING A DOC UNDER ANOTHER REFUSED OUTRIGHT: the sidebar's drag-to-nest breaks.
# Reddens: doc-boundaries: "while moving it under another doc of its own workspace works"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = '    if (writable.parentDocId) await this.assertDocParent(writable.parentDocId, doc.workspaceId, userId, docId)\n'
b = "    if (writable.parentDocId) throw new NotFoundException('Parent doc not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-13-move-under-refuses-all: applied")
