# THE CREATE MODAL SENDS A START AFTER THE DUE DATE WITHOUT A WORD
# (`found-30-sep/a-task-starts-after-it-is-due`): nothing is said beside the dates and Create is
# live, so the create is sent and refused.
#
# Reddens: task-values: "the create modal says, beside the dates and before Create, that the start is after the due date, and makes nothing until it is not — then Create makes the task with both dates (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const datesBackwards = datesOutOfOrder(startDate, dueDate)\n',
     '  const datesBackwards = datesOutOfOrder(startDate, dueDate) && false\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-12-the-modal-sends-the-dates-as-typed: the modal never says the dates are the wrong way round')
