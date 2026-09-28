# DELETING A DOC ASKS FULL EDIT AGAIN, while archiving it asks Edit.
# Re-aimed 28 September: Edit deletes a doc now (found-28-sep/doc-archive-and-delete-at-two-levels), so this restores the Full edit it asked.
# Reddens: full-edit-levels: "a doc shared at Edit is renamed and deleted, as ClickUp’s Edit deletes a Doc, and one shared at Full edit is deleted too — in a space that is view-only for the member"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.assertDocLevel(docId, userId, 'edit')\n"
b = "    await this.assertDocLevel(docId, userId, 'admin')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fel-11-doc-delete-asks-edit: deleting a doc asks Full edit again')
