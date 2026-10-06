# DELETING A SHARED VIEW ASKS WHAT CHANGING ONE ASKS: Edit deletes.
# Reddens: unit: view-write.test.ts "deleting a shared view takes Full edit, where Edit changes it; a reader’s own private view is theirs to delete"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "  if (!(act === 'delete' ? facts.reachesDelete : facts.reachesLevel)) return 'level'\n"
b = "  if (!facts.reachesLevel) return 'level'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-44-delete-asks-the-change-level-unit: deleting a shared view asks what changing one asks")
