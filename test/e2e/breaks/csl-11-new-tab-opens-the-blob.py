# NEW TAB OPENS THE RECORDING'S OBJECT URL, NOT ITS LINK (`resume-defects/resume-7`).
#
# `finished.url` is the player's own source two lines away, and it plays in the
# new tab too, for as long as this document lives: a `blob:` address that is
# private to it. The tab it opens cannot be shared, bookmarked or reopened.
#
# Reddens: clip-links: "New tab opens that same link"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = "    if (url) window.open(url, '_blank', 'noopener')\n"
b = "    if (url) window.open(finished?.url ?? url, '_blank', 'noopener')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-11-new-tab-opens-the-blob: New tab opens the blob: url')
