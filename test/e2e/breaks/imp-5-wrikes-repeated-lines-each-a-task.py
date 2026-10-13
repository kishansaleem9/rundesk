# WRIKE'S LINES REPEATING A TASK ARE EACH A TASK: a task in two folders is made twice.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "a legacy .xls is read from its compound file and imported as Wrike exports a folder: the task it lists in two folders made once, each in its folder’s list, the date a date"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (k) seen.add(k)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imp-5-wrikes-repeated-lines-each-a-task: Wrike's repeated lines are imported again")
