# THE SHARE DIALOG SHOWS THE LINK AND SAYS NOTHING OF IT (`resume-defects/resume-7`).
#
# The sentence under the link goes: who can open it, and that it does not
# expire. The dialog is back to handing over an address with no word about
# it, which is half of what this item was about — "and nothing tells the
# person".
#
# Reddens: clip-links: "and it says who can open it and that it does not expire"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-clips-page.tsx'
a = "{t(shareAudience === 'members' ? 'clipLink.members' : 'clipLink.anyone')}"
b = "{shareAudience === 'members' ? null : null}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-25-the-dialog-says-nothing-of-who: the dialog is silent about who can open the link')
