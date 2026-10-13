# A WORD DOCUMENT'S LINKS ARE DROPPED: the text stays and leads nowhere.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "a .docx becomes a Doc titled by its Title paragraph, its headings, bulleted and numbered lists, table, bold and link kept"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docx-tiptap.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (href) marks.push({ type: 'link', attrs: { href } })\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-6-a-word-link-dropped: a .docx link is not marked')
