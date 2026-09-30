# THE SHARE DIALOG SHOWS THE CLIP'S SIGNED STORAGE URL (`resume-defects/resume-7`).
#
# The card already holds a URL for the clip — the library's, signed for fifteen
# minutes to draw its player — and the dialog shows and copies that one. It is
# what the dialog did before, with a shorter fuse than its hour.
#
# Reddens: clip-links: "the clips page’s share dialog hands out the same link, on this site — not a storage URL"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-clips-page.tsx'
a = "      setShareUrl(`${window.location.origin}${data.path}`)\n"
b = "      setShareUrl(shareClip?.url ?? '')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-13-the-dialog-shows-a-signed-url: the dialog hands out a URL that expires')
