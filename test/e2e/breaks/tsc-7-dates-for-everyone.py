# THE DUE DATE IS OFFERED TO EVERYBODY.
# Reddens: task-sheet-capabilities: "in a view-only space the sheet offers the member no change: no title to edit, the status and dates disabled, no Archive or Delete, and no comment box"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
# Re-aimed 6 October: the due box is a `DateTimeBox`, written when a date is accepted and closed only
# to whoever may not change the task (`found-30-sep/sheet-dates-write-as-typed`).
a = '            onCommit={(dueDate) => patchTask.mutateAsync({ dueDate })}\n            disabled={!caps.edit}\n'
b = '            onCommit={(dueDate) => patchTask.mutateAsync({ dueDate })}\n            disabled={false}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tsc-7-dates-for-everyone: the due date for everyone')
