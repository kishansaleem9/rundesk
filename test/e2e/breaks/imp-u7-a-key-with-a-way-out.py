# AN IMPORT KEY MAY CLIMB OUT OF ITS IMPORTER'S PLACE (security): `../` and a folder
# below are taken.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: unit: import-files.test.ts "is a key one segment under the importer’s own place, and nothing else"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-files.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  return /^[A-Za-z0-9._-]+$/.test(rest) && !rest.includes('..')\n",
     '  return /^[A-Za-z0-9._/-]+$/.test(rest)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imp-u7-a-key-with-a-way-out: a key may leave the importer's place")
