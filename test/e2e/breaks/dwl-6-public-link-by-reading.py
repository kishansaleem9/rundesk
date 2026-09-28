# THE PUBLIC LINK ASKS ONLY THE READ RULE: a view share publishes the doc.
# Re-aimed 28 September: making a link asks `assertMayPublish` now, the one rule the panel's switch reads too (`delete-and-public-link-offered-to-everyone`).
# Reddens: doc-write-levels: "a VIEW share reads and does not rename, comment or make public (403 each, all unchanged) — an EDIT share renames"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "  async enablePublicShare(docId: string, userId: string) {\n    const doc = await this.assertMayPublish(docId, userId, true)\n"
b = "  async enablePublicShare(docId: string, userId: string) {\n    const doc = await this.assertDocAccess(docId, userId)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dwl-6-public-link-by-reading: applied")
