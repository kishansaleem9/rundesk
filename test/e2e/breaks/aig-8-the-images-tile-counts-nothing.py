# IMAGE RUNS BELONG TO NO CATEGORY, SO THE IMAGES TILE COUNTS NONE.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "each ask is one run of `image.generate`, and the AI value report counts it under Images generated, a tile it now fills"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-categories.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  'image.generate':         'images',\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-8-the-images-tile-counts-nothing: the images tile counts nothing')
