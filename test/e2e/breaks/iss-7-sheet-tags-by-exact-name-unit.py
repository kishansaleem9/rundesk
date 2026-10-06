# THE SPREADSHEET IMPORT FINDS A TAG BY ITS EXACT SPELLING (`found-30-sep/spreadsheet-import-skips-task-rules`).
# Reddens: unit: spreadsheet-import.service.test.ts "a tag is found by its name whatever its case (found-30-sep/spreadsheet-import-skips-task-rules)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "sql`lower(${labels.name}) = lower(${trimmed})`"
b = "eq(labels.name, trimmed)"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("iss-7-sheet-tags-by-exact-name-unit: the spreadsheet import matches a tag by exact case")
