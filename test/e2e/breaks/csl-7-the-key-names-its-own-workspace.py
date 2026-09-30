# A CLIP KEY IS CHECKED AGAINST THE WORKSPACE IT NAMES, NOT THE ONE ASKED (`resume-defects/resume-7`).
#
# The key's shape is asked of the workspace inside the key, so any clip key is
# "one of this workspace's clips". Somebody asking through their own workspace
# gets a link to another workspace's clip — and since a clip has one link, it
# is that clip's existing link they are handed.
#
# Reddens: clip-links: "somebody from another workspace cannot get this workspace’s clip a link: refused at the workspace, and through their own workspace the key is not theirs"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    if (!isWorkspaceClipKey(clipKey, workspaceId)) {\n'
b = "    if (!isWorkspaceClipKey(clipKey, String(clipKey).split('/')[1])) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-7-the-key-names-its-own-workspace: any workspace links any clip')
