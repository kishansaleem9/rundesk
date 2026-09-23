# THE ATTACH TAKES ANY KEY: a task can be handed a key that walks out of the workspace's clips.
# Always true at runtime for a real key, and not provably true to the compiler (see okb-16).
# Reddens: object-key-boundaries: "a task cannot attach a key that walks out of its workspace’s clips — refused, and nothing is attached"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (!isWorkspaceClipKey(data.storageKey, ctx.workspaceId)) {\n'
b = '    if (!data.storageKey) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-22-attach-clip-any-key: applied")
