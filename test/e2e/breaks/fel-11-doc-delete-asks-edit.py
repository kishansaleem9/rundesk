# DELETING A DOC ASKS EDIT, AS IT DID.
# Reddens: full-edit-levels: "a doc shared at Edit is renamed and not deleted (403, still there); one shared at Full edit is deleted"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.assertDocLevel(docId, userId, 'admin')\n"
b = "    await this.assertDocLevel(docId, userId, 'edit')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fel-11-doc-delete-asks-edit: deleting a doc asks edit, as it did')
