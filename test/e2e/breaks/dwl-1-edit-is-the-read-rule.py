# AN EDIT ASKS ONLY THE READ RULE, as it did: whoever may read a doc rewrites it.
# Reddens: doc-write-levels: "a VIEW share reads and does not rename, comment or make public (403 each, all unchanged) — an EDIT share renames"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    const { doc } = await this.assertDocLevel(docId, userId, 'edit')\n    // Only the columns this route may write — see doc-update-fields.ts. The\n"
b = '    const doc = await this.assertDocAccess(docId, userId)\n    // Only the columns this route may write — see doc-update-fields.ts. The\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dwl-1-edit-is-the-read-rule: applied")
