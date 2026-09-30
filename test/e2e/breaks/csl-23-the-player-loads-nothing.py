# THE CLIP PAGE'S PLAYER LOADS NOTHING UNTIL IT IS PRESSED (`resume-defects/resume-7`).
#
# `preload="none"`, the bandwidth-saving default somebody reaches for: the page
# has its address, and shows a black box with no picture, no length and no
# sign that the address works until play is pressed — and a lapsed address
# is not found out until then either.
#
# Reddens: clip-links: "and the player plays it: a real recording, opened by its link, shows its picture"
import io
p = '/home/user/rundesk/apps/web/src/pages/clip-link-page.tsx'
a = '          preload="metadata"\n'
b = '          preload="none"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-23-the-player-loads-nothing: the player shows nothing until pressed')
