# THE DUE DATE IS OFFERED TO EVERYBODY.
# Reddens: task-sheet-capabilities: "in a view-only space the sheet offers the member no change: no title to edit, the status and dates disabled, no Archive or Delete, and no comment box"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
a = '            onChange={(e) => patchTask.mutate({ dueDate: fromDateTimeInput(e.target.value) })}\n            disabled={patchTask.isPending || !caps.edit}\n'
b = '            onChange={(e) => patchTask.mutate({ dueDate: fromDateTimeInput(e.target.value) })}\n            disabled={patchTask.isPending}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tsc-7-dates-for-everyone: the due date for everyone')
