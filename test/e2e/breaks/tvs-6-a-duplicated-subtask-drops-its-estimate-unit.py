# A DUPLICATED SUBTASK ESTIMATED BELOW NOUGHT IS COPIED WITH NO ESTIMATE.
#
# Reddens: unit: task-templates.service.test.ts "copies the task’s estimate and its subtask’s as they are held, below nought among them, and records the duplicate"
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
print("tvs-6-a-duplicated-subtask-drops-its-estimate-unit: a subtask's estimate below nought is not copied")
