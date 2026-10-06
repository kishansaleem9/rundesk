# THE SPREADSHEET IMPORT FINDS A TAG BY ITS EXACT SPELLING (`found-30-sep/spreadsheet-import-skips-task-rules`): "urgent-x"
# beside the workspace's "Urgent-X" is a second tag.
# Reddens: imports: "a sheet row tagged in another case is tagged with the workspace’s tag — no second tag differing only in case"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "sql`lower(${labels.name}) = lower(${trimmed})`"
b = "eq(labels.name, trimmed)"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-25-sheet-tags-by-exact-name: the spreadsheet import matches a tag by exact case")
