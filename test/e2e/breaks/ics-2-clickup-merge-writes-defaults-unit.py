# A CLICKUP MERGE WRITES STATUS AND PRIORITY FROM EVERY ROW (`found-5-oct/import-merge-resets-fields-the-file-lacks`).
# RE-AIMED 6 October: the merge's set is named before it is written, beside its status's category (`found-6-oct/clickup-merge-writes-a-status-without-its-category`).
# Reddens: unit: clickup-import.service.test.ts "a merge from a CSV with no Status or Priority column writes neither (found-5-oct/import-merge-resets-fields-the-file-lacks)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = '    const set = mergeSetOf(t, carries)\n'
b = '    const set = mergeSetOf(t, { status: true, priority: true })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ics-2-clickup-merge-writes-defaults-unit: the ClickUp merge writes status and priority from every row")
