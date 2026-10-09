# A LIBRARY THAT FAILED IS DRAWN AS ONE THAT HOLDS NO PHOTOS.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "a library that fails is said to have not answered, and its rate limit as too many searches — never an empty grid"
import io
p = '/home/user/rundesk/apps/web/src/components/cover-photo-search.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  } else if (results.isError && photos.length === 0) {\n',
     '  } else if (results.isError && photos.length < 0) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-w5-a-failure-reads-as-none: a failure reads as none')
