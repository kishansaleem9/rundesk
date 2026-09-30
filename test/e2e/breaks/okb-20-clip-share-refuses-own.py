# A SHARE RULE THAT REFUSES EVERY KEY: no clip can be linked to at all.
# Always true at runtime for any key, and not provably true to the compiler (see okb-16).
# RE-AIMED for `resume-defects/resume-7`: the rule lives in `link`, which every share mode calls.
# Reddens: object-key-boundaries: "while the workspace’s own clip is shared, and its link serves the clip"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    if (!isWorkspaceClipKey(clipKey, workspaceId)) {\n'
b = '    if (clipKey) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-20-clip-share-refuses-own: applied")
