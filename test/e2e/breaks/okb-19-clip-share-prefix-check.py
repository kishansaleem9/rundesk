# SHARE CHECKS THE PREFIX AGAIN, at its own call site: the walk is signed into a working link.
# RE-AIMED for `resume-defects/resume-7`: every share mode now hands out the clip's
# link, and `link` holds the key rule for all of them, so the prefix check goes there.
# The walk gets a link, and opening it signs another workspace's file.
# Reddens: object-key-boundaries: "a clip key that starts with the workspace’s clips and walks out of them is not shared — no link comes back for it"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    if (!isWorkspaceClipKey(clipKey, workspaceId)) {\n'
b = "    if (typeof clipKey !== 'string' || !clipKey.startsWith(clipPrefix(workspaceId))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-19-clip-share-prefix-check: applied")
