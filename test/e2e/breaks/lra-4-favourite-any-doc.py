# A DOC FAVOURITED BY ID WITH NO RULE, as it was.
# Reddens: lookup-read-access: "and a favourite of something they can no longer open is not named in their list — while every open one is"
import io
p = '/home/user/rundesk/apps/api/src/modules/favorites/favorites.service.ts'
a = '        .where(and(eq(docs.workspaceId, workspaceId), inArray(docs.id, ids), hidden.length ? notInArray(docs.id, hidden) : undefined))\n'
b = '        .where(and(eq(docs.workspaceId, workspaceId), inArray(docs.id, ids)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lra-4-favourite-any-doc: applied")
