# THE TASK SHEET'S START BOX IS BOUNDED BY THE DUE DATE (`max`), as it was between 30 September and
# the owner's decision of 1 October.
#
# Reddens: task-values: "the task sheet takes a start date typed after the due date — the PATCH answers 200, the task holds it, and nothing is said against it — and neither date box is bounded by the other (read by SQL)"
#
# Re-aimed 6 October: the start box is a `DateTimeBox` (`found-30-sep/sheet-dates-write-as-typed`), so
# the box is given a `max` to pass on, and the sheet bounds the start by the due date through it. Re-aimed again
# the same day: the box is the `DateBox` every date box shares, which `DateTimeBox` hands its props to.
import io
for p, a, b in [
    ('/home/user/rundesk/apps/web/src/components/date-time-box.tsx',
     'type BoxProps = {\n  disabled?: boolean\n',
     'type BoxProps = {\n  max?: string\n  disabled?: boolean\n'),
    ('/home/user/rundesk/apps/web/src/components/date-time-box.tsx',
     '  onDone,\n  disabled,\n  className,\n',
     '  onDone,\n  max,\n  disabled,\n  className,\n'),
    ('/home/user/rundesk/apps/web/src/components/date-time-box.tsx',
     '      disabled={disabled}\n      className={className}\n',
     '      disabled={disabled}\n      max={max}\n      className={className}\n'),
    ('/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx',
     '            testId="task-start-date"\n            stored={detail.startDate}\n',
     '            testId="task-start-date"\n            stored={detail.startDate}\n            max={detail.dueDate ? new Date(new Date(detail.dueDate).getTime() - new Date(detail.dueDate).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : undefined}\n'),
]:
    s = io.open(p, encoding='utf-8').read()
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-values-33-the-sheet-bounds-the-start-by-the-due: the sheet's start box stops at the due date")
