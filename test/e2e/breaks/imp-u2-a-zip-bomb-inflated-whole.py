# A ZIP ENTRY IS INFLATED WHOLE BEFORE ITS SIZE IS ASKED: a bomb's megabytes are made,
# and only then refused.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: unit: zip-read.test.ts "a zip bomb — a small declared size that inflates to far more — is stopped at its declared size"
import io
p = '/home/user/rundesk/apps/api/src/common/import/zip-read.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('zlib.inflateRawSync(stored, { maxOutputLength: Math.max(size, 1) })',
     'zlib.inflateRawSync(stored)'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-u2-a-zip-bomb-inflated-whole: inflation has no limit')
