# A MERGE WRITES THE STATUS A FILE DOES NOT MAP (`found-5-oct/import-merge-resets-fields-the-file-lacks`).
# Reddens: unit: spreadsheet-import.util.test.ts "writes no status and no priority from a file with neither column"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (mapped.has('status')) {\n"
b = "  if (mapped.size > 0) {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("isu-3-merge-writes-an-unmapped-status-unit: the merge writes a status the file does not map")
