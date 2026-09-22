# The leading H1 is kept as content, so every import grows a duplicate heading.
#
# THE ONE THE CONTENT ROUND TRIP CANNOT SEE ON ITS OWN. A doc's title lives
# outside its content, and `exportDocMarkdown` prepends `# <title>` when the
# body has no leading H1 — so an importer that does not CONSUME one produces a
# doc whose body opens with its own title. Export it and import it again and
# there are two. The markdown-to-tiptap conversion is untouched and perfect
# throughout; it is the DOCUMENT that drifts.
#
# Reddens: doc-import: "exporting it gives back the file byte for byte — headings, lists, tables, code and links all survived"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/tiptap-markdown.ts'
a = "    content.content.shift()\n"
b = "    void 0\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tiptap-markdown.ts: the title heading stays in the body.')
