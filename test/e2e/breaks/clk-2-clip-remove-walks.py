# REMOVE TAKES ANY KEY UNDER THE PREFIX, measured by the service's unit test.
# Reddens: unit: clips.service.test.ts "refuses to delete a key that walks out of the workspace’s clips, and deletes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    if (!isWorkspaceClipKey(storageKey, workspaceId)) {\n'
b = "    if (typeof storageKey !== 'string' || !storageKey.startsWith(clipPrefix(workspaceId))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("clk-2-clip-remove-walks: applied")
