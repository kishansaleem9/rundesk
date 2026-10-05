# THE TASK SHEET'S START BOX IS BOUNDED BY THE DUE DATE (`max`), as it was between 30 September and
# the owner's decision of 1 October.
#
# Reddens: task-values: "the task sheet takes a start date typed after the due date — the PATCH answers 200, the task holds it, and nothing is said against it — and neither date box is bounded by the other (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('            value={toDateTimeInput(detail.startDate)}\n',
     '            value={toDateTimeInput(detail.startDate)}\n            max={toDateTimeInput(detail.dueDate) || undefined}\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("task-values-33-the-sheet-bounds-the-start-by-the-due: the sheet's start box stops at the due date")
