# DELETE CHECKS THE PREFIX AGAIN, at its own call site: the walk deletes workspace B's object.
# Reddens: object-key-boundaries: "and deleting that key is refused, with workspace B’s file still there afterwards"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    if (!isWorkspaceClipKey(storageKey, workspaceId)) {\n'
b = "    if (typeof storageKey !== 'string' || !storageKey.startsWith(clipPrefix(workspaceId))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-18-clip-remove-prefix-check: applied")
