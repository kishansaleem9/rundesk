# A DUPLICATE HANDS ITS SUBTASKS THEIR ESTIMATES AS STORED, one below nought among them.
#
# Reddens: unit: task-templates.service.test.ts "makes the whole copy — its subtask with no estimate — where the subtask holds one below nought, and records the duplicate"
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
print('twr-24-a-duplicated-subtask-keeps-its-estimate-unit: a subtask is copied with the estimate it holds')
