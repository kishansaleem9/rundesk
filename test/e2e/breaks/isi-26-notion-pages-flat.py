# NOTION’S PAGES COME IN SIDE BY SIDE, NOT INSIDE THE PAGE THEY ARE UNDER.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a Notion workspace export comes in as ClickUp brings it: its databases into one Folder, each a List whose rows are tasks — every row, the page under a row its description, its properties text fields — and its pages Docs, the page under another a page of its Doc, with their titles and not Notion’s ids"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        const parentDocId = p.parent ? made.get(p.parent) ?? null : null\n',
     '        const parentDocId: string | null = null\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-26-notion-pages-flat: NOTION’S PAGES COME IN SIDE BY SIDE, NOT INSIDE THE PAGE THEY ARE UNDER.')
