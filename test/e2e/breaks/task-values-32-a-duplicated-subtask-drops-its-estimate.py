# A DUPLICATED SUBTASK ESTIMATED BELOW NOUGHT IS COPIED WITH NO ESTIMATE.
#
# Reddens: task-values: "duplicating a task whose subtask is estimated below nought copies it whole, the subtask with its estimate, and records it (201, read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        timeEstimate: st.timeEstimate ?? undefined,\n',
     '        timeEstimate: st.timeEstimate != null && st.timeEstimate < 0 ? undefined : st.timeEstimate ?? undefined,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("task-values-32-a-duplicated-subtask-drops-its-estimate: a subtask's estimate below nought is not copied")
