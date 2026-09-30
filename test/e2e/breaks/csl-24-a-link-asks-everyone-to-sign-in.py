# EVERY CLIP LINK ASKS FOR A SIGN-IN (`resume-defects/resume-7`).
#
# The members-only rule is applied to every workspace, which is the "safe"
# reading ClickUp's sources rule out: "anyone with the link to a Clip can
# access it", and Clips "do not require authentication". A link pasted to a
# client asks them for an account they do not have.
#
# Reddens: clip-links: "anyone holding the link can open it, signed out, as ClickUp’s clips need no sign-in: the page shows the clip’s title, and its player’s address serves the recording"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    if (row.blockPublicSharing) {\n'
b = '    if (row.blockPublicSharing || !viewer?.id) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-24-a-link-asks-everyone-to-sign-in: a clip link needs an account everywhere')
