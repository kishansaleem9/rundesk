# A CLICKUP MERGE WRITES A STATUS WITHOUT ITS CATEGORY, asked of the service itself.
# Reddens: unit: clickup-import.service.test.ts "a merge of a Done row writes the status with its category, closed, as the spreadsheet merge does (found-6-oct/clickup-merge-writes-a-status-without-its-category)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = '        ...(set.status ? { statusCategory: categoryForDefaultKey(set.status) } : {}),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ics-17-a-clickup-merge-writes-no-status-category-unit: clickup-import.service.ts: a merge writes the status without its category.')
