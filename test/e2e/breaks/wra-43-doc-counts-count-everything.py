# THE HUB'S COUNTS WITH NO READER RULE: the list right, the numbers beside it counting what it leaves out.
# Reddens: workspace-read-access: "the docs hub lists and counts only what the member may open — the admin’s lists and counts all of it"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = '        .where(and(eq(docs.workspaceId, workspaceId), hidden.length ? notInArray(docs.id, hidden) : undefined, extra))\n'
b = '        .where(and(eq(docs.workspaceId, workspaceId), extra))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-43-doc-counts-count-everything: applied")
