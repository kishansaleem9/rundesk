# A SHARE THAT OPENS NOTHING: a doc shared with the member stays shut to them.
# Reddens: workspace-read-access: "a member cannot open a doc of a space they are refused, nor the page under it (404) — while they open an open doc, and a doc and page shared with them; the admin opens all five"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/doc-access.ts'
a = '  return (await sharedDocIds(db, doc.workspaceId, userId, chain)).size > 0\n'
b = '  return false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-45-doc-shares-ignored: applied")
