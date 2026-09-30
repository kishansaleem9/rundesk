# THE PUBLIC EDITOR NO LONGER REGISTERS THE CALLOUT (A5.8). (`found-30-sep/public-doc-page-reads-the-envelope`)
#
# A doc with a block the editor does not know is refused as invalid content,
# and the visitor sees an empty page.
#
# Reddens: public-doc-page: "the blocks it was written with are kept: a ticked to-do, a table, a callout and an embedded list’s name"
import io
p = '/home/user/rundesk/apps/web/src/routes/d.$slug.tsx'
s = io.open(p, encoding='utf-8').read()
a = "import { Callout, ListEmbedStatic } from '../lib/tiptap-doc-blocks'\n"
b = "import { ListEmbedStatic } from '../lib/tiptap-doc-blocks'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = '        TableKit,\n        Callout,\n        ListEmbedStatic,\n'
b = '        TableKit,\n        ListEmbedStatic,\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdp-5-a-callout-is-not-registered: the callout is not registered')
