# THE IMAGE SERVICE IS ASKED WITHOUT THE SERVER'S KEY.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "the comment box’s AI makes the pictures asked for — two, as the image service drew them for that description — each shown and chosen"
#   or "the chat composer’s AI makes a picture too: added, it is attached to the message, and sent with it"
#   or "only the one left chosen is posted on the comment — the first picture, as a PNG of its very bytes, named after its description"
#   or "each ask is one run of `image.generate`, and the AI value report counts it under Images generated, a tile it now fills"
#   or "the service’s rate limit is said as too many requests (429), its failure as a service that did not answer (502), and each is written down as a failed run"
#
# Re-aimed 8 October: the last 3 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
#
# Every ask is refused, so every check that draws a picture fails with it.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/image-generation.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' },\n",
     "      headers: { authorization: `Bearer ${cfg.key.length < 0 ? cfg.key : 'none'}`, 'content-type': 'application/json' }, // BROKEN: no key\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-1-the-key-is-not-sent: the key is not sent')
