# AN ATTACH RULE THAT REFUSES EVERY KEY: no clip can be attached to a task.
# Always true at runtime for any key, and not provably true to the compiler (see okb-16).
# Reddens: object-key-boundaries: "while one of the workspace’s own clips is attached as the task’s own copy, which serves the clip"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (!isWorkspaceClipKey(data.storageKey, ctx.workspaceId)) {\n'
b = '    if (data.storageKey) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-23-attach-clip-refuses-own: applied")
