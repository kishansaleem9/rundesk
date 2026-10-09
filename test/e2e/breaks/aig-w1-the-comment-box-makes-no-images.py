# THE COMMENT BOX’S AI OFFERS NO IMAGES.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "the comment box’s AI makes the pictures asked for — two, as the image service drew them for that description — each shown and chosen"
#   or "only the one left chosen is posted on the comment — the first picture, as a PNG of its very bytes, named after its description"
#   or "each ask is one run of `image.generate`, and the AI value report counts it under Images generated, a tile it now fills"
#   or "and the composer says the service did not answer, in its words, and draws no picture"
#
# Re-aimed 8 October: the last 3 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                <option value="image">{t(\'taskDetail.aiModeImage\')}</option>\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-w1-the-comment-box-makes-no-images: the comment box makes no images')
