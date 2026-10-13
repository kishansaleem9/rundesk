# A HEADER REPEATED IN A SHEET IS ONE COLUMN NAME: the mapping cannot tell the two apart.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: unit: sheet-file.test.ts "names an empty header for its column and numbers a repeated one, so the mapping can tell them apart"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (times > 1) name = `${name} (${times})`\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-u6-repeated-headers-one-column: a repeated header is not numbered')
