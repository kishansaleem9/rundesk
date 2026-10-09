# EVERY PICTURE MADE IS ADDED, CHOSEN OR NOT.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "only the one left chosen is posted on the comment — the first picture, as a PNG of its very bytes, named after its description"
import io
p = '/home/user/rundesk/apps/web/src/components/image-generator.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('              onAdd(made.filter((_, i) => picked.has(i)).map(imageFile))\n',
     '              onAdd(made.map(imageFile)) // BROKEN: every picture, chosen or not\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-w3-every-picture-is-added: every picture is added')
