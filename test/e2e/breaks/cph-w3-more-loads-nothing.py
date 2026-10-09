# “MORE PHOTOS” LOADS NOTHING.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "“More photos” adds the second page — thirty in all, none twice — and is gone once the library has no more"
#   or "choosing one makes it the task’s cover — the photo’s own address, as the server holds it, drawn on the sheet, in place of the colour — and the library is told it was used, as Unsplash asks"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 8 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/web/src/components/cover-photo-search.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('              onClick={() => void results.fetchNextPage()}\n',
     '              onClick={() => void results.hasNextPage} // BROKEN: loads nothing\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-w3-more-loads-nothing: more loads nothing')
