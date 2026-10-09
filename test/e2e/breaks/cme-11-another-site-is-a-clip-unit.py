# `cme-w3`'s edit, claimed by the unit test: the same path on another site is this site's clip.
# (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`)
# Reddens: unit: clip-links.test.ts "another site’s page, or a token of another shape, is no clip"
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
print("cme-11-another-site-is-a-clip-unit: `cme-w3`'s edit, claimed by the unit test: the same path on another site is this site's clip.")
