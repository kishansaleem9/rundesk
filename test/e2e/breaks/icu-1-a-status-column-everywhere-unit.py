# THE CLICKUP PARSER SAYS EVERY FILE CARRIES A STATUS (`found-5-oct/import-merge-resets-fields-the-file-lacks`).
# Reddens: unit: clickup-csv.util.test.ts "says which of status and priority the file carries a column for"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-csv.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "carries: { status: sIdx !== -1, priority: pIdx !== -1 } }"
b = "carries: { status: true, priority: pIdx !== -1 } }"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("icu-1-a-status-column-everywhere-unit: every file carries a status")
