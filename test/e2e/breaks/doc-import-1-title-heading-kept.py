# The leading H1 is kept as content, so every import grows a duplicate heading.
#
# THE ONE THE ROUND TRIP IS BLIND TO, and this patch is what proved it.
#
# A doc's title lives outside its content, and `exportDocMarkdown` prepends
# `# <title>` ONLY when the body does not already open with one. So a doc
# carrying its own title as content exports to exactly the same bytes as one
# that does not: the compensation is perfect and the round trip stays green.
# Aimed at that check first, this patch reddened NOTHING — which is how the
# blind spot was found rather than reasoned about.
#
# It is aimed at the stored DOCUMENT instead, which is where the duplication
# actually is: the doc's first block becomes an h1 holding its own title.
#
# Reddens: doc-import: "and the title was CONSUMED — the doc does not carry its own heading twice"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/tiptap-markdown.ts'
a = "    content.content.shift()\n"
b = "    void 0\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tiptap-markdown.ts: the title heading stays in the body.')
