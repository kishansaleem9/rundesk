# A DELETE ASKS ONLY THE READ RULE: a view-only space's docs go.
# Re-aimed 25 September: Full edit is asked where it was offered (`full-edit-enforced-nowhere`).
# Re-aimed 28 September: deleting asks Edit now (`doc-archive-and-delete-at-two-levels`); the anchor is its line.
# Reddens: doc-write-levels: "in a “view only” space a member neither renames, deletes nor makes a doc (403 each, unchanged, none made) — in an open space they make one"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    // same result (found-28-sep/doc-archive-and-delete-at-two-levels).\n    await this.assertDocLevel(docId, userId, 'edit')\n"
b = '    // same result (found-28-sep/doc-archive-and-delete-at-two-levels).\n    await this.assertDocAccess(docId, userId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dwl-7-delete-by-reading: applied")
