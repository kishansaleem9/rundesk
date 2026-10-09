# WITH NO KEY, UNSPLASH IS ASKED ANYWAY, with no key.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: unit: cover-photos.controller.test.ts "with no key for the library, a search and a use say photo search is not set up (503)"
import io
p = '/home/user/rundesk/apps/api/src/modules/cover-photos/photo-library.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (!key) return null\n',
     "  if (!key) return { base: 'http://127.0.0.1:9', key: 'none' } // BROKEN: no key, asked anyway\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-9-no-key-asks-unsplash-unit: WITH NO KEY, UNSPLASH IS ASKED ANYWAY, with no key.')
