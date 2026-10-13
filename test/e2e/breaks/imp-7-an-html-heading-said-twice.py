# AN HTML PAGE'S FIRST HEADING IS SAID TWICE: as its title and again as its first line.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "an .html page becomes a Doc titled by its <title>, its first heading not said twice"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/html-tiptap.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      content.content.shift()\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-7-an-html-heading-said-twice: the first <h1> stays in the body')
