# A CLICKUP MERGE WRITES STATUS AND PRIORITY FROM EVERY ROW (`found-5-oct/import-merge-resets-fields-the-file-lacks`).
# Reddens: unit: clickup-import.service.test.ts "a merge from a CSV with no Status or Priority column writes neither (found-5-oct/import-merge-resets-fields-the-file-lacks)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      .set({ ...mergeSetOf(t, carries), updatedAt: new Date() })\n"
b = "      .set({ ...mergeSetOf(t, { status: true, priority: true }), updatedAt: new Date() })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("ics-2-clickup-merge-writes-defaults-unit: the ClickUp merge writes status and priority from every row")
