# MONDAY'S EXPORT IS READ AS ONE TABLE: the board's name is the header, and the
# groups' names and column names become tasks.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "it is read as Monday writes a board: three items under two groups, the board’s and groups’ names, the repeated column names and the row of sums no task — the page says so, and names the import after the board"
#   or "the workbook is uploaded as it is and read from its sheet — the page says which — and Monday’s columns map: Name, Status, Date and Person, and each item’s group as its list"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (preset === 'monday') return readBoard(table)\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imp-2-a-monday-board-read-as-one-table: Monday's export is read as a flat table")
