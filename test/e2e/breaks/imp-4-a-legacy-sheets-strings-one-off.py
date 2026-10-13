# A LEGACY .xls's SHARED STRINGS ARE READ ONE OFF: every text cell holds its
# neighbour's words.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "a legacy .xls is read from its compound file and imported as Wrike exports a folder: the task it lists in two folders made once, each in its folder’s list, the date a date"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/xls-read.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        put(d.readUInt16LE(0), d.readUInt16LE(2), shared[d.readUInt32LE(6)] ?? '')\n",
     "        put(d.readUInt16LE(0), d.readUInt16LE(2), shared[d.readUInt32LE(6) + 1] ?? '')\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-4-a-legacy-sheets-strings-one-off: an .xls cell reads the next shared string')
