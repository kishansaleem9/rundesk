# A CLICKUP MERGE WRITES A STATUS WITHOUT ITS CATEGORY again: a task merged from a Done row reads
# done and still counts in progress.
# Reddens: imports: "a ClickUp merge of a Done row writes the status with its category, as the spreadsheet merge does: the task reads done, and closed"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = '        ...(set.status ? { statusCategory: categoryForDefaultKey(set.status) } : {}),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('imports-74-a-clickup-merge-writes-no-status-category: clickup-import.service.ts: a merge writes the status without its category.')
