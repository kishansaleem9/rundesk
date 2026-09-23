# A DELETE RULE THAT REFUSES EVERY KEY: a clip can never be taken out of the library.
# Always true at runtime for any key, and not provably true to the compiler (see okb-16).
# Reddens: object-key-boundaries: "while the workspace’s own clip is deleted, and leaves the library"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    if (!isWorkspaceClipKey(storageKey, workspaceId)) {\n'
b = '    if (storageKey) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-21-clip-remove-refuses-own: applied")
