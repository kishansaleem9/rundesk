# OPENING A TASK LOGS NO VIEW.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "opening a task’s sheet logs one view of it, read by SQL"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    void api(`/tasks/${taskId}/viewed`, { method: 'POST' }).catch(() => undefined)\n",
     '    // BROKEN: no view logged\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-w2-the-sheet-logs-no-view: the sheet logs no view')
