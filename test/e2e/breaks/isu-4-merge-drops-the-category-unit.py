# A MERGE WRITES A STATUS WITHOUT ITS CATEGORY (`found-5-oct/import-merge-resets-fields-the-file-lacks`): the column every
# rollup reads is left behind.
# Reddens: unit: spreadsheet-import.util.test.ts "writes the status, its category and the priority when the file maps them"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "    set.statusCategory = row.statusCategory\n"
b = ""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("isu-4-merge-drops-the-category-unit: the merge writes no status category")
