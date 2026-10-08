# THE CLIPS PAGE OFFERS SHARE ON EVERY CARD AGAIN, a guest's where the server
# refuses them its link (`found-30-sep/guests-may-ask-for-clip-links`).
# Reddens: clip-library-access: "a guest makes no link that opens for anybody, even of their own clip — refused 403 “Guests cannot share clips publicly”, the library and the page offering them no Share where a member is offered it — and where the workspace’s links open for members only, theirs is made"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-clips-page.tsx'
a = "            {clip.mayShare === true && (\n"
b = "            {(clip.mayShare === true || clip.mayShare === false) && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-33-the-page-offers-a-guest-share: Share is drawn on every card')
