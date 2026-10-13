# A CONFLUENCE SPACE'S PAGES ARE ALL PUT AT ITS TOP: the tree is flattened.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "its pages are nested as the space nests them — Home, Runbooks under it, Deploy under that — each holding only its own words (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('          const parentDocId = (page.parent && byFile.get(page.parent)) || root.id\n',
     '          const parentDocId = root.id\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imp-8-confluence-pages-all-at-the-top: every page goes straight under the space's doc")
