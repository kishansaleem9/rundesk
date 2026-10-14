# A TASK COMES IN WITHOUT ITS TIME ESTIMATE.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "a task keeps its status, priority, start, due time, estimate, the moment it was made, its markdown description, tags and checklist (a nested item under its own); its subtask is its subtask, and the subtask’s own one level up; a closed task and a done one are closed"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      estimateSeconds: Number.isFinite(estimateMs) && estimateMs > 0 ? Math.round(estimateMs / 1000) : null,\n',
     '      estimateSeconds: null,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-4-no-estimate: A TASK COMES IN WITHOUT ITS TIME ESTIMATE.')
