# A CLICKUP MERGE WRITES A STATUS THE FILE DOES NOT CARRY (`found-5-oct/import-merge-resets-fields-the-file-lacks`).
# Reddens: unit: clickup-csv.util.test.ts "writes no status and no priority from a file with neither column"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-csv.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "    ...(carries.status ? { status: mapStatus(t.status) } : {}),\n"
b = "    status: mapStatus(t.status),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("icu-2-clickup-merge-writes-a-default-status-unit: the ClickUp merge writes a status from every row")
