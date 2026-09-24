# THE PUBLIC LINK ASKS ONLY THE READ RULE: a view share publishes the doc.
# Reddens: doc-write-levels: "a VIEW share reads and does not rename, comment or make public (403 each, all unchanged) — an EDIT share renames"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "  async enablePublicShare(docId: string, userId: string) {\n    const { doc, role } = await this.assertDocLevel(docId, userId, 'edit')\n"
b = "  async enablePublicShare(docId: string, userId: string) {\n    const doc = await this.assertDocAccess(docId, userId)\n    const role = 'member' as string\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dwl-6-public-link-by-reading: applied")
