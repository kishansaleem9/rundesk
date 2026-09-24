# A DELETE ASKS ONLY THE READ RULE: a view-only space's docs go.
# Reddens: doc-write-levels: "in a “view only” space a member neither renames, deletes nor makes a doc (403 each, unchanged, none made) — in an open space they make one"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "  async deleteForUser(docId: string, userId: string) {\n    await this.assertDocLevel(docId, userId, 'edit')\n"
b = '  async deleteForUser(docId: string, userId: string) {\n    await this.assertDocAccess(docId, userId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dwl-7-delete-by-reading: applied")
