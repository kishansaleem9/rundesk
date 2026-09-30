# AN ESTIMATE OF NOUGHT IS REFUSED (`found-30-sep/task-estimate-below-zero`): the rule reads "below
# nought" as "nought or below", so clearing an estimate to 0 is refused on every route.
#
# Reddens: task-values: "while an estimate of nought is taken by POST /tasks, PATCH and the bulk editor, and stored as 0 (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-values.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('value < 0 ||',
     'value <= 0 ||'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-16-nought-is-no-estimate: an estimate of nought is refused')
