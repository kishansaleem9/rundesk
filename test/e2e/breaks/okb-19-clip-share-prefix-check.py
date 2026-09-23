# SHARE CHECKS THE PREFIX AGAIN, at its own call site: the walk is signed into a working link.
# Reddens: object-key-boundaries: "a clip key that starts with the workspace’s clips and walks out of them is not shared — no link comes back for it"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    if (!isWorkspaceClipKey(body.storageKey, workspaceId)) {\n'
b = "    if (typeof body.storageKey !== 'string' || !body.storageKey.startsWith(clipPrefix(workspaceId))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-19-clip-share-prefix-check: applied")
