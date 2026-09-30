# THE SHARE DIALOG TELLS EVERY WORKSPACE THAT ANYONE WITH THE LINK CAN WATCH (`resume-defects/resume-7`).
#
# Both sides of the choice say "anyone": in a workspace that blocks public
# sharing the dialog promises a link that works for a client, and the client
# meets a sign-in they cannot get past.
#
# Reddens: clip-links: "where public sharing is blocked, the dialog says only the workspace’s members can watch it, and a share by email to somebody outside is refused, saying why"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-clips-page.tsx'
a = "{t(shareAudience === 'members' ? 'clipLink.members' : 'clipLink.anyone')}"
b = "{t(shareAudience === 'members' ? 'clipLink.anyone' : 'clipLink.anyone')}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-14-the-dialog-says-anyone-to-everyone: a members-only link is described as open to anyone')
