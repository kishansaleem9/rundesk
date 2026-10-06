# A MERGE NAMES A DATE THE ROW DOES NOT HOLD (`found-5-oct/import-merge-resets-fields-the-file-lacks`).
# Reddens: unit: spreadsheet-import.util.test.ts "leaves a mapped description or date alone where the row holds none"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (mapped.has('dueDate') && row.dueDate) set.dueDate = row.dueDate\n"
b = "  if (mapped.has('dueDate')) set.dueDate = row.dueDate\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("isu-5-merge-clears-an-empty-date-unit: the merge names an empty due date")
