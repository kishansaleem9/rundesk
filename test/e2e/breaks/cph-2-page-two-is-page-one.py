# EVERY PAGE ASKED OF THE LIBRARY IS ITS FIRST.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "“More photos” adds the second page — thirty in all, none twice — and is gone once the library has no more"
import io
p = '/home/user/rundesk/apps/api/src/modules/cover-photos/photo-library.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const params = new URLSearchParams({ query, page: String(page), per_page',
     '  const params = new URLSearchParams({ query, page: String(page > 0 ? 1 : page), per_page'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-2-page-two-is-page-one: page two is page one')
