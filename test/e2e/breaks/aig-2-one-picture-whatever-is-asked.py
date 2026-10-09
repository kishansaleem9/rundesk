# THE SERVICE IS ASKED FOR ONE PICTURE, HOWEVER MANY WERE ASKED FOR.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "the comment box’s AI makes the pictures asked for — two, as the image service drew them for that description — each shown and chosen"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/image-generation.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      body: JSON.stringify({ model: cfg.model, prompt, n: count, size }),\n',
     '      body: JSON.stringify({ model: cfg.model, prompt, n: count > 0 ? 1 : count, size }), // BROKEN: one picture\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-2-one-picture-whatever-is-asked: one picture, whatever is asked')
