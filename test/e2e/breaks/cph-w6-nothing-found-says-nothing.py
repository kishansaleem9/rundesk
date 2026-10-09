# A SEARCH THAT FINDS NOTHING SAYS NOTHING.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "words no photo holds say there are no photos for them, and draw none"
import io
p = '/home/user/rundesk/apps/web/src/components/cover-photo-search.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    body = <p className="py-8 text-center text-sm text-muted-foreground" data-testid="cover-search-empty">{t(\'coverImage.searchEmpty\', { query })}</p>\n',
     '    body = null // BROKEN: says nothing\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-w6-nothing-found-says-nothing: nothing found says nothing')
