# THE DOCS HUB WITH NO READER RULE, as it was: every doc of the workspace, listed.
# Reddens: workspace-read-access: "the docs hub lists and counts only what the member may open — the admin’s lists and counts all of it"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = '      eq(docs.workspaceId, workspaceId),\n      hidden.length ? notInArray(docs.id, hidden) : undefined,\n'
b = '      eq(docs.workspaceId, workspaceId),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-42-doc-hub-lists-everything: applied")
