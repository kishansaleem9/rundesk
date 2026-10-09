# THE SAME PATH ON ANOTHER SITE IS DRAWN AS THIS SITE'S CLIP.
# (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`)
# Reddens: clip-link-embeds: "the same path on another site stays a link and is drawn as no clip, nor is an address of another shape"
import io
p = '/home/user/rundesk/apps/web/src/lib/clip-links.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (url.origin !== origin) return null\n',
     "  // BROKEN: another site's page is read as a clip\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cme-w3-another-site-is-a-clip: another site is a clip')
