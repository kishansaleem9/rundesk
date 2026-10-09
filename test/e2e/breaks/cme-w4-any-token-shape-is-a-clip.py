# AN ADDRESS OF ANY SHAPE UNDER /clips/ IS DRAWN AS A CLIP.
# (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`)
# Reddens: clip-link-embeds: "the same path on another site stays a link and is drawn as no clip, nor is an address of another shape"
import io
p = '/home/user/rundesk/apps/web/src/lib/clip-links.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  return m && TOKEN.test(m[1]) ? m[1] : null\n',
     '  return m && (TOKEN.test(m[1]) || m[1].length > 0) ? m[1] : null // BROKEN: any shape is a token\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cme-w4-any-token-shape-is-a-clip: any token shape is a clip')
