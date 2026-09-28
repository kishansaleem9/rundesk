# DELETING A DOC ASKS FULL EDIT AGAIN, while archiving asks Edit.
# Reddens: doc-trash-level: "a member with an Edit share deletes a doc (200), and it is in their own Trash as deleted by them — ClickUp: Edit deletes a Doc"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.assertDocLevel(docId, userId, 'edit')\n"
b = "    await this.assertDocLevel(docId, userId, 'admin')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dtl-1-delete-asks-full-edit: done')
