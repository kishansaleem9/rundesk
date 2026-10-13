# MONDAY'S OWN ROWS — A GROUP'S SUMS, A SUBITEM'S LINE — ARE READ AS ITEMS.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: unit: sheet-file.test.ts "reads Monday’s board: its items under their groups, each group’s name in a Group column the preset maps to a list"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (!(cells[0] ?? '').trim()) {\n      leftOut++\n      continue\n    }\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-u12-mondays-sums-imported: rows with no name are items')
