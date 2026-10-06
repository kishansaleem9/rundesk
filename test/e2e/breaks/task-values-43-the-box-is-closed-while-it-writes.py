# THE SHEET'S DUE BOX IS CLOSED WHILE ITS WRITE IS OUT (`found-30-sep/sheet-dates-write-as-typed`, as the review
# found nothing checked it): `disabled` while the PATCH is pending, as the box was before, so it loses its focus at
# Enter and what is typed while the write is out goes nowhere.
# Reddens: task-values: "the sheet’s due box stays open while its write is out, and a date corrected meanwhile is written after it: Enter on the 25th, and while that write is held the box is enabled and keeps its focus; the 8th typed back then is kept, and Enter writes it once the 25th has landed — two PATCHes, in that order — so the task holds the 8th (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '            onCommit={(dueDate) => patchTask.mutateAsync({ dueDate })}\n            disabled={!caps.edit}\n'
b = '            onCommit={(dueDate) => patchTask.mutateAsync({ dueDate })}\n            disabled={patchTask.isPending || !caps.edit}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-values-43-the-box-is-closed-while-it-writes: the due box is disabled while its write is out")
