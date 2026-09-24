# A DOC IS MADE IN ANY SPACE ITS MAKER MAY READ, as it was: a view-only space takes new docs.
# Reddens: doc-write-levels: "in a “view only” space a member neither renames, deletes nor makes a doc (403 each, unchanged, none made) — in an open space they make one"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    await assertCanCreateInSpace(this.db, { spaceId, actorId, kind: 'doc' })\n  }\n"
b = '    void spaceId\n  }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dwl-4-docs-made-anywhere: applied")
