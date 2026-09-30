# A MEMBERS-ONLY LINK IS MAILED TO SOMEBODY OUTSIDE THE WORKSPACE (`resume-defects/resume-7`).
#
# The refusal waits for a share with no address, which an external share never
# is, so the mail goes: the dialog reports a share, and the person it was sent
# to meets a sign-in they can never get past.
#
# Reddens: clip-links: "where public sharing is blocked, the dialog says only the workspace’s members can watch it, and a share by email to somebody outside is refused, saying why"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "    if (body.mode === 'external' && made.audience === 'members') {\n"
b = "    if (body.mode === 'external' && made.audience === 'members' && !body.email) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-8-an-email-goes-to-an-outsider: a members-only clip is mailed outside')
