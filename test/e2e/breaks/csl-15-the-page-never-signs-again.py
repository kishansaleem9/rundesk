# A CLIP PAGE LEFT OPEN PAST ITS SIGNATURE NEVER SIGNS AGAIN (`resume-defects/resume-7`).
#
# The re-sign's guard is inverted, so every player error is final: a long clip
# paused past its window cannot be played on, and the page says it could not
# be played until somebody reloads it. Opening the link fresh still works,
# which is why only the held page shows it.
#
# Reddens: clip-links: "and a page left open past the window signs again when its player asks for the clip: the player moves to a new address, and shows the picture"
import io
p = '/home/user/rundesk/apps/web/src/pages/clip-link-page.tsx'
a = "    if (!failedSrc || resignedFrom.current === failedSrc) {\n"
b = "    if (failedSrc || resignedFrom.current === failedSrc) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-15-the-page-never-signs-again: a lapsed signature under an open page is final')
