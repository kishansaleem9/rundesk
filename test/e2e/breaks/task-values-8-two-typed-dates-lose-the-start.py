# TWO DATES TYPED THE WRONG WAY ROUND BESIDE A TEMPLATE LOSE THE START, SILENTLY
# (`found-30-sep/a-task-starts-after-it-is-due`): the merge drops the typed start instead of
# passing both on to be refused.
#
# Reddens: task-values: "and with both dates typed the wrong way round beside a template, its route refuses them as POST /tasks does (400, saying so) and makes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    else if (!typedDue) dueDate = undefined\n',
     '    else startDate = undefined\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-8-two-typed-dates-lose-the-start: two typed dates the wrong way round lose the start')
