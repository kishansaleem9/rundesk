# A CLIP'S LINK SAYS IT OPENS FOR ANYONE, WHATEVER THE WORKSPACE BLOCKS (`resume-defects/resume-7`).
#
# Who the link is for is answered without asking the workspace, so the toast
# and the dialog promise "anyone with the link" in a workspace where only its
# members will get in, and a mail to somebody outside goes out.
#
# Reddens: clip-links: "the link of a clip in a workspace that blocks public sharing says it opens for members only"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "    return ws?.blockPublicSharing ? 'members' : 'anyone'\n"
b = "    return ws ? 'anyone' : 'anyone'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-21-the-link-says-anyone-everywhere: every link claims to open for anyone')
