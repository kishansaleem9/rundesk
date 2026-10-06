# A CLICKUP MERGE DROPS A PRIORITY THE FILE CARRIES (`found-5-oct/import-merge-resets-fields-the-file-lacks`).
# Reddens: unit: clickup-csv.util.test.ts "writes them when the file carries them"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-csv.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "    ...(carries.priority ? { priority: mapPriority(t.priority) } : {}),\n"
b = ""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("icu-3-clickup-merge-drops-a-priority-unit: the ClickUp merge writes no priority")
