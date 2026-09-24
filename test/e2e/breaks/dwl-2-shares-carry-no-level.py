# A SHARE'S LEVEL IS NOT READ: the space's decides, whatever the doc was shared as.
# Reddens: doc-write-levels: "a COMMENT share comments and does not rename (403, unchanged)"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/doc-access.ts'
a = '  for (const id of chain) {\n    const level = byDoc.get(id)\n    if (level) return level\n  }\n'
b = '  void byDoc\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dwl-2-shares-carry-no-level: applied")
