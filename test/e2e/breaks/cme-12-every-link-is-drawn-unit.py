# EVERY CLIP A TEXT LINKS TO IS DRAWN, however many.
# (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`)
# Reddens: unit: clip-links.test.ts "a text’s clips, each once, in order, and no more than are drawn"
import io
p = '/home/user/rundesk/apps/web/src/lib/clip-links.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (out.length >= MAX_CLIP_EMBEDS) break\n',
     '    // BROKEN: no more than MAX_CLIP_EMBEDS is not kept\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cme-12-every-link-is-drawn-unit: EVERY CLIP A TEXT LINKS TO IS DRAWN, however many.')
