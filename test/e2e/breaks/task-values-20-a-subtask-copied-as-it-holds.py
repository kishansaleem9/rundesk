# A DUPLICATE HANDS ITS SUBTASKS THEIR ESTIMATES AS STORED (`found-30-sep/task-estimate-below-zero`,
# found by a review of this work): a subtask holding -60 from before the rule is refused by
# `createTask` after the copy, its checklists and its values are made — a half-made copy.
#
# Reddens: task-values: "duplicating a task whose subtask holds an estimate below nought, from before the rule, makes one whole copy — its subtask copied with no estimate — and records it (201, read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        timeEstimate: carriedEstimate(st.timeEstimate),\n',
     '        timeEstimate: st.timeEstimate ?? undefined,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-20-a-subtask-copied-as-it-holds: a subtask is copied with the estimate it holds')
