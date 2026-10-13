# THE NOTION REPORT DOES NOT SAY HOW MANY PAGES CAME IN.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a Notion workspace export comes in as ClickUp brings it: its databases into one Folder, each a List whose rows are tasks — every row, the page under a row its description, its properties text fields — and its pages Docs, the page under another a page of its Doc, with their titles and not Notion’s ids"
import io
p = '/home/user/rundesk/apps/web/src/pages/import-apps.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        {result.pagesImported !== undefined && <Figure testid="import-app-r-pages" label={t(\'import.appPages\')} value={result.pagesImported} />}\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-w5-notion-pages-uncounted: THE NOTION REPORT DOES NOT SAY HOW MANY PAGES CAME IN.')
